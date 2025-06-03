// No usar import aquí para máxima compatibilidad con el runner del hook
// const fs = require('fs'); // Comentado para simplificar

module.exports = async function(context) {
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('!!!!!!!!!!!!!! BEFORE BUILD SCRIPT EXECUTED !!!!!!!!!!!!!!!');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log(`[beforeBuild] Context AppDir: ${context.appDir}`);
  return null;
};
