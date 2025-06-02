import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const eventsFilePath = path.join(process.cwd(), 'data', 'manual-events.json');

/**
 * Lee los eventos manuales del archivo JSON.
 * @returns {Promise<Array>} Un array de eventos.
 */
export const readManualEvents = async () => {
    try {
        const data = await fs.readFile(eventsFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Si el archivo no existe o hay un error al leerlo/parsearlo,
        // devolvemos un array vacío (asumiendo que es la primera vez o está corrupto)
        if (error.code === 'ENOENT') {
            return []; // El archivo no existe, retornar array vacío
        }
        console.error('Error al leer el archivo de eventos manuales:', error);
        return []; // En caso de otros errores, también retornar vacío para no romper la app
    }
};

/**
 * Escribe el array de eventos al archivo JSON.
 * @param {Array} eventsArray - El array de eventos a escribir.
 * @returns {Promise<void>}
 */
const writeManualEvents = async (eventsArray) => {
    try {
        await fs.writeFile(eventsFilePath, JSON.stringify(eventsArray, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error al escribir en el archivo de eventos manuales:', error);
        throw new Error('No se pudo guardar la lista de eventos manuales.');
    }
};

/**
 * Añade un nuevo evento manual.
 * @param {object} eventData - Datos del evento (title, start, end, description, color, allDay).
 * @returns {Promise<object>} El evento añadido con su nuevo ID.
 */
export const addManualEvent = async (eventData) => {
    const events = await readManualEvents();
    const newEvent = {
        id: crypto.randomUUID(),
        title: eventData.title,
        start: eventData.start, // Espera formato YYYY-MM-DD
        end: eventData.end || eventData.start, // Si no hay end, es igual a start
        allDay: typeof eventData.allDay === 'boolean' ? eventData.allDay : true,
        description: eventData.description || '',
        color: eventData.color || '', // Color por defecto o específico
        // Podríamos añadir más campos como 'className' para FullCalendar
    };
    events.push(newEvent);
    await writeManualEvents(events);
    return newEvent;
};

/**
 * Actualiza un evento manual existente.
 * @param {string} eventId - ID del evento a actualizar.
 * @param {object} updatedData - Datos actualizados del evento.
 * @returns {Promise<object|null>} El evento actualizado o null si no se encontró.
 */
export const updateManualEvent = async (eventId, updatedData) => {
    const events = await readManualEvents();
    const eventIndex = events.findIndex(event => event.id === eventId);

    if (eventIndex === -1) {
        return null; // Evento no encontrado
    }

    // Actualizar solo los campos proporcionados en updatedData
    events[eventIndex] = { ...events[eventIndex], ...updatedData };
    
    // Asegurar que el ID no se sobrescriba si updatedData lo incluye accidentalmente
    events[eventIndex].id = eventId; 

    await writeManualEvents(events);
    return events[eventIndex];
};

/**
 * Elimina un evento manual.
 * @param {string} eventId - ID del evento a eliminar.
 * @returns {Promise<boolean>} True si se eliminó, false si no se encontró.
 */
export const deleteManualEvent = async (eventId) => {
    let events = await readManualEvents();
    const initialLength = events.length;
    events = events.filter(event => event.id !== eventId);

    if (events.length === initialLength) {
        return false; // No se encontró el evento, nada que eliminar
    }

    await writeManualEvents(events);
    return true;
};
