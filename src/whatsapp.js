import http from "node:http";

const CDP_PORT = Number(process.env.WHATSAPP_CDP_PORT || 9222);
const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || "RADAR DE OFERTAS";

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port: CDP_PORT, path, timeout: 2000 },
      res => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch (error) { reject(error); }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Chrome CDP indisponível."));
    });
  });
}

async function getWhatsAppTarget() {
  const pages = await getJson("/json");
  const target = pages.find(
    page => page.type === "page" && page.url?.startsWith("https://web.whatsapp.com/")
  );

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Aba do WhatsApp Web não encontrada no Chrome.");
  }

  return target;
}

async function openCdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      reject(new Error("CDP timeout: " + method));
    }, 10000);

    const onMessage = event => {
      const message = JSON.parse(event.data);

      if (message.id !== id) return;

      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);

      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    };

    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    command,
    close: () => ws.close()
  };
}

async function cdp(wsUrl, method, params = {}) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;

  const command = (commandMethod, commandParams = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      reject(new Error("CDP timeout: " + commandMethod));
    }, 7000);

    const onMessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;

      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);

      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    };

    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({
      id,
      method: commandMethod,
      params: commandParams
    }));
  });

  try {
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    return await command(method, params);
  } finally {
    ws.close();
  }
}

export async function connectWhatsApp() {
  const target = await getWhatsAppTarget();

  const result = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: '(() => { const body=document.body?.innerText||""; const login=/Escaneie para entrar|Conectar com número de telefone|Insira o número de telefone/i.test(body); const ready=!!document.querySelector("[contenteditable=true]") || !!document.querySelector("[data-testid=conversation-info-header]"); return {login,ready,title:document.title}; })()',
    returnByValue: true
  });

  const state = result?.result?.value || {};

  if (state.login) {
    throw new Error("WhatsApp Web não está conectado no Chrome.");
  }

  if (!state.ready) {
    throw new Error("WhatsApp Web ainda não terminou de carregar.");
  }

  console.log("[WHATSAPP] sessão do Chrome conectada.");
  console.log("[WHATSAPP] grupo configurado:", GROUP_NAME);

  return { target };
}

async function clickGroup(groupName) {
  const target = await getWhatsAppTarget();

  const current = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: '(() => { const el=document.querySelector("[data-testid=conversation-info-header]"); return (el?.innerText||"").trim(); })()',
    returnByValue: true
  });

  if (String(current?.result?.value || "").startsWith(groupName)) {
    return;
  }

  const nameLiteral = JSON.stringify(groupName);

  const clicked = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      '(() => { const name=' + nameLiteral + '; const span=[...document.querySelectorAll("span[title]")].find(el=>el.getAttribute("title")===name); if(!span)return false; (span.closest("[role=gridcell]")||span.closest("[data-testid^=list-item-]")||span).click(); return true; })()',
    returnByValue: true
  });

  if (!clicked?.result?.value) {
    const search = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression:
        '(() => { const input=document.querySelector("[aria-label*=\\\"Pesquisar\\\"]"); if(!input)return false; input.focus(); return true; })()',
      returnByValue: true
    });

    if (!search?.result?.value) {
      throw new Error("Grupo não encontrado no WhatsApp Web: " + groupName);
    }

    await cdp(target.webSocketDebuggerUrl, "Input.insertText", {
      text: groupName
    });

    await new Promise(resolve => setTimeout(resolve, 700));

    const foundAfterSearch = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression:
        '(() => { const name=' + nameLiteral + '; const span=[...document.querySelectorAll("span[title]")].find(el=>el.getAttribute("title")===name); if(!span)return false; (span.closest("[role=gridcell]")||span).click(); return true; })()',
      returnByValue: true
    });

    if (!foundAfterSearch?.result?.value) {
      throw new Error("Grupo não encontrado no WhatsApp Web: " + groupName);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  const verified = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      '(() => { const name=' + nameLiteral + '; const el=document.querySelector("[data-testid=conversation-info-header]"); return (el?.innerText||"").trim().startsWith(name); })()',
    returnByValue: true
  });

  if (!verified?.result?.value) {
    throw new Error("Não foi possível abrir o grupo: " + groupName);
  }
}

export async function listWhatsAppGroups() {
  await connectWhatsApp();
  const target = await getWhatsAppTarget();

  const result = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: '(() => [...document.querySelectorAll("span[title]")].map(el=>el.getAttribute("title")).filter(Boolean))()',
    returnByValue: true
  });

  return [...new Set(result?.result?.value || [])];
}

export async function sendWhatsAppGroupImage(_unused, groupName, filePath, caption = "") {
  if (!filePath) {
    throw new Error("Arquivo de imagem não informado.");
  }

  const finalGroupName = groupName || GROUP_NAME;
  await clickGroup(finalGroupName);

  const target = await getWhatsAppTarget();
  const session = await openCdpSession(target.webSocketDebuggerUrl);

  try {
    await session.command("DOM.enable");

    const attached = await session.command("Runtime.evaluate", {
      expression: '(() => { const b=[...document.querySelectorAll("button,[role=button]")].find(e=>e.getAttribute("aria-label")==="Anexar"); if(!b)return false; b.click(); return true; })()',
      returnByValue: true
    });

    if (!attached?.result?.value) {
      throw new Error("Botão Anexar do WhatsApp não encontrado.");
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const doc = await session.command("DOM.getDocument", {
      depth: -1
    });

    const input = await session.command("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: 'input[type="file"][accept*="image"], input[type="file"]'
    });

    if (!input?.nodeId) {
      throw new Error("Campo de upload de imagem não encontrado.");
    }

    await session.command("DOM.setFileInputFiles", {
      files: [filePath],
      nodeId: input.nodeId
    });

    const deadline = Date.now() + 15000;
    let ready = false;

    while (Date.now() < deadline) {
      const state = await session.command("Runtime.evaluate", {
        expression: '(() => { const canvas=document.querySelector("[data-testid=media-editor-canvas]"); const img=canvas?.querySelector("img"); const send=[...document.querySelectorAll("[role=button]")].some(e=>(e.getAttribute("aria-label")||"").startsWith("Enviar ")) || !!document.querySelector("[data-testid=wds-ic-send-filled]"); return { image:!!img, send }; })()',
        returnByValue: true
      });

      const value = state?.result?.value || {};

      if (value.image && value.send) {
        ready = true;
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!ready) {
      throw new Error("O WhatsApp não concluiu o carregamento da imagem.");
    }

    if (caption.trim()) {
      const captionSet = await session.command("Runtime.evaluate", {
        expression: `(() => {
          const box =
            document.querySelector('[data-testid="conversation-compose-box-input"]') ||
            [...document.querySelectorAll('[contenteditable="true"]')].find(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });

          if (!box) return false;

          box.focus();

          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(box);
          selection.removeAllRanges();
          selection.addRange(range);

          return true;
        })()`,
        returnByValue: true
      });

      if (!captionSet?.result?.value) {
        throw new Error("Campo de legenda da imagem não encontrado.");
      }

      await session.command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Backspace",
        code: "Backspace",
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8
      });

      await session.command("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Backspace",
        code: "Backspace",
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8
      });

      await session.command("Input.insertText", {
        text: caption.trim()
      });
    }

    const send = await session.command("Runtime.evaluate", {
      expression: '(() => { const b=[...document.querySelectorAll("[role=button]")].find(e=>e.getAttribute("aria-label")?.startsWith("Enviar ")) || document.querySelector("[data-testid=wds-ic-send-filled]")?.closest("[role=button]"); if(!b)return false; b.click(); return true; })()',
      returnByValue: true
    });

    if (!send?.result?.value) {
      throw new Error("Botão de envio da imagem não encontrado.");
    }

    const closedDeadline = Date.now() + 10000;
    while (Date.now() < closedDeadline) {
      const closed = await session.command("Runtime.evaluate", {
        expression: '(() => !document.querySelector("[data-testid=media-editor-canvas]"))()',
        returnByValue: true
      });

      if (closed?.result?.value === true) {
        console.log("[WHATSAPP] imagem + legenda enviadas em uma única mensagem.");
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    throw new Error("O WhatsApp não confirmou o fechamento do editor de mídia.");
  } finally {
    session.close();
  }
}

export async function sendWhatsAppGroupMessage(_unused, groupName, message) {
  if (!message?.trim()) {
    throw new Error("Mensagem WhatsApp vazia.");
  }

  const finalGroupName = groupName || GROUP_NAME;
  await clickGroup(finalGroupName);

  const target = await getWhatsAppTarget();

  const focused = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: '(() => { const box=document.querySelector("[contenteditable=true]"); if(!box)return false; box.focus(); return true; })()',
    returnByValue: true
  });

  if (!focused?.result?.value) {
    throw new Error("Campo de mensagem do WhatsApp não encontrado.");
  }

  await cdp(target.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });

  await cdp(target.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });

  await cdp(target.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8
  });

  await cdp(target.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8
  });

  await cdp(target.webSocketDebuggerUrl, "Input.insertText", {
    text: message.trim()
  });

  await new Promise(resolve => setTimeout(resolve, 300));

  const send = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: '(() => { const buttons=[...document.querySelectorAll("button,[role=button]")]; const b=buttons.find(e=>e.getAttribute("aria-label")==="Enviar"); if(!b)return false; b.click(); return true; })()',
    returnByValue: true
  });

  if (!send?.result?.value) {
    throw new Error("Botão Enviar do WhatsApp não encontrado.");
  }
}

export function getWhatsAppGroupName() {
  return GROUP_NAME;
}
