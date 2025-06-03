import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs'; // Importar fs

// Recrear __dirname y __filename para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let expressServerProcess;
let mainWindow;
let EXPRESS_PORT = 3000; // Puerto por defecto si .env no se puede leer o no define PORT

function getPortFromEnv() {
  const defaultPort = 3000; // Puerto por defecto explícito
  try {
    // En desarrollo, __dirname es electron-app, .env está en ../.env
    // En producción (empaquetado), __dirname es la raíz de la app, .env está en ./ (o __dirname)
    const envPath = app.isPackaged
      ? path.join(__dirname, '.env') // Asumiendo que .env se copia a la raíz de la app empaquetada
      : path.join(__dirname, '..', '.env');
    console.log(`Intentando leer puerto desde: ${envPath}`);
    if (fs.existsSync(envPath)) {
      const envFileContent = fs.readFileSync(envPath, { encoding: 'utf8' });
      const portMatch = envFileContent.match(/^PORT=(\d+)$/m); // Busca PORT=XXXX en una línea
      if (portMatch && portMatch[1]) {
        const parsedPort = parseInt(portMatch[1], 10);
        console.log(`Puerto encontrado en .env: ${parsedPort}`);
        return parsedPort;
      } else {
        console.log('Variable PORT no encontrada en .env. Usando puerto por defecto.');
      }
    } else {
      console.log('Archivo .env no encontrado. Usando puerto por defecto.');
    }
  } catch (error) {
    console.error('Error al leer el puerto desde .env:', error);
  }
  return defaultPort;
}

// Al inicio de la app, obtener el puerto
EXPRESS_PORT = getPortFromEnv();
const EXPRESS_URL = `http://localhost:${EXPRESS_PORT}`;
// Cargamos la raíz, y la app Express redirigirá a /login si es necesario
const APP_LOAD_URL = `${EXPRESS_URL}/`; 
const SERVER_READY_MESSAGE = `Servidor corriendo en ${EXPRESS_URL}`;
console.log(`Electron cargará: ${APP_LOAD_URL}`);
console.log(`Electron esperará el mensaje: "${SERVER_READY_MESSAGE}"`);

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadURL(APP_LOAD_URL); // Usar la URL construida
  // mainWindow.webContents.openDevTools(); // Asegurarse que DevTools esté abierto

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startExpressServer() {
  const isDev = !app.isPackaged;

  const expressAppBaseDir = isDev ? path.join(__dirname, '..') : __dirname;
  const expressAppEntryPoint = isDev ? 'src/app.js' : 'app-src/app.js';
  
  console.log(`Modo Desarrollo: ${isDev}`);
  console.log(`Base del Servidor Express (cwd): ${expressAppBaseDir}`);
  console.log(`Punto de Entrada Express: ${expressAppEntryPoint}`);

  expressServerProcess = spawn('node', [expressAppEntryPoint], { cwd: expressAppBaseDir, stdio: 'pipe' });

  expressServerProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`Express stdout: ${output}`);
    if (output.includes(SERVER_READY_MESSAGE)) { // Usar el mensaje construido
      console.log('Servidor Express detectado como listo. Creando ventana.');
      if (!mainWindow) {
        createWindow();
      }
    }
  });

  expressServerProcess.stderr.on('data', (data) => {
    console.error(`Express stderr: ${data.toString()}`);
  });

  expressServerProcess.on('close', (code) => {
    console.log(`Proceso del servidor Express cerrado con código ${code}`);
  });

  expressServerProcess.on('error', (err) => {
    console.error('Error al iniciar el proceso del servidor Express:', err);
  });
}

app.whenReady().then(() => {
  startExpressServer();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0 && expressServerProcess) {
      if (mainWindow === null && output.includes(SERVER_READY_MESSAGE)) { // Asegurarse que el servidor esté listo
        createWindow();
      }
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // app.quit(); // Comentado para revisión, podría causar cierre prematuro si el servidor tarda
  }
});

app.on('will-quit', () => {
  if (expressServerProcess) {
    console.log('Cerrando el proceso del servidor Express...');
    expressServerProcess.kill();
  }
});
