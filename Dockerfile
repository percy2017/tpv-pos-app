# Usar una imagen oficial de Node.js 20. Alpine es una buena opción por ser ligera.
FROM node:20-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar las dependencias de producción
# Esto también reconstruirá cualquier dependencia binaria para el entorno Alpine
RUN npm install --production

# Copiar los archivos y carpetas de la aplicación
COPY src ./src
COPY public ./public

# Exponer el puerto en el que corre tu aplicación (definido en src/app.js como process.env.PORT || 3000)
EXPOSE 3000

# Comando para iniciar la aplicación cuando el contenedor arranque
# Según tu package.json, el script "start" es "node src/app.js"
CMD [ "node", "src/app.js" ]
