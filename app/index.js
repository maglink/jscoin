const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');
const unhandled = require('electron-unhandled');

unhandled();

let jsCoin = require("../lib");
let pathForConfig = app.getPath("userData");
jsCoin.init(pathForConfig, "data/config.json");
global.jsCoin = jsCoin;

let mainWindow;

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 640, height: 420,
        minWidth: 640, minHeight: 420,
        icon: path.join(__dirname, 'icon/png/64x64.png')
    });
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Open the DevTools.
    //mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        mainWindow = null
    })
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow()
    }
});