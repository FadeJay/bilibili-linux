const {protocol, session} = require('electron')
const https = require('https');
const HttpGet = (url, headers = {})=>{
  return new Promise((resolve, reject)=>{
    const u = new URL(url)
    // console.log(u)
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers,
    };
    const result = []
    const req = https.request(options, res => {
      // console.log(`statusCode: ${res.statusCode}`);
      res.on('end', ()=>{
        resolve(Buffer.concat(result).toString())
      })
      res.on('data', d => {
        result.push(d)
      });
    });
    req.on('error', error => {
      // console.error(error);
      reject(error)
    });
  
    req.end();
  })
}

// HOOK
const {app, BrowserWindow} = require('electron');

const originalBrowserWindow = BrowserWindow;

const hookBrowserWindow = (OriginalBrowserWindow) => {
    function HookedBrowserWindow(options) {
        // 修改或增加构造函数的选项
        // if (options && options.webPreferences)
        //   options.webPreferences.devTools = true

        // 使用修改后的选项调用原始构造函数
        return new OriginalBrowserWindow(options);
    }

    // 复制原始构造函数的原型链并进行替换
    HookedBrowserWindow.prototype = Object.create(OriginalBrowserWindow.prototype);
    HookedBrowserWindow.prototype.constructor = HookedBrowserWindow;
    Object.setPrototypeOf(HookedBrowserWindow, OriginalBrowserWindow);

    return HookedBrowserWindow;
};

// 使用替换的构造函数
const HookedBrowserWindow = hookBrowserWindow(originalBrowserWindow);
// 保存原 require 方法，并重新定义 require 方法
const modelRequire = require;
require = (...args) => {
  // 拦截参数
  // console.log('params is: ', args);
  const result = modelRequire(...args)
  if (args[0] === 'electron') {
    return {
      ...result,
      BrowserWindow: HookedBrowserWindow
    }
  }
  return result;
}

const originloadURL = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function(){
  this.setMinimumSize(300, 300);
  // 设置UA，有些番剧播放链接Windows会403
  this.webContents.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) bilibili_pc/1.9.1 Chrome/98.0.4758.141 Electron/17.4.11 Safari/537.36')
  console.log('=====loadURL', arguments)
  if(arguments[0].includes('player.html') || arguments[0].includes('index.html')){
    this.webContents.openDevTools()
    const path = require('path');
    const extPath = path.join(path.dirname(app.getAppPath()), "extensions");
    console.log('----extPath----', extPath)
    this.webContents.session.loadExtension(extPath + "/area_unlimit").then(({ id }) => {
      // ...
      console.log('-----Load Extension:', id)
    })
    // 设置PAC代理脚本
    this.webContents.on('ipc-message-sync', (event, ...args)=>{
      if(args[0] === "config/roamingPAC"){
        console.log("receive config/roamingPAC: ", ...args)
        const ses = this.webContents.session
        ses.setProxy({
          mode: 'pac_script',
          pacScript: args[1]
        }).then(res=>{
          console.log("====set proxy")
          ses.forceReloadProxyConfig().then(()=>{
            ses.resolveProxy("akamai.net").then(res=>{
              console.log("resolveProxy akamai.net --> ", res)
              event.returnValue = res.length === 0?'error':'ok'
              if(res.length === 0)
              ses.setProxy({mode:'system'})
            })

          })
        }).catch(err=>{
          console.error("====set error", err)
          event.returnValue = 'error'
        })
      }
    })
  }
  originloadURL.apply(this, arguments)
};
app.on('ready', ()=>{
  // 自定义协议的具体实现
  protocol.registerStringProtocol('roaming', (req, cb) => {
    // console.log('registerHttpProtocol', req)
    HttpGet(req.url.replace('roaming', 'https'), {
      cookie: req.headers['x-cookie']
    }).then(res=>{
      cb(res)
    }).catch(err=>{
      cb({
        statusCode: 500,
        data: JSON.stringify(err)
      })
    })
  })
  
  protocol.registerHttpProtocol('roaming-thpic', (req, cb) => {
    cb({
      url: req.url.replace('roaming-thpic', 'https')
    })
  })
  
});