import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, "mock-db.json");
// Read the complete mock database
export async function readDatabase() {
 const data = await fs.readFile(DB_FILE, "utf8");
 return JSON.parse(data);
}
// Save the complete mock database
export async function writeDatabase(data) {
 await fs.writeFile(
   DB_FILE,
   JSON.stringify(data, null, 2),
   "utf8"
 );
}
// Get one collection/table
export async function getCollection(collectionName) {
 const database = await readDatabase();
 if (!Array.isArray(database[collectionName])) {
   throw new Error(
     `Collection "${collectionName}" does not exist`
   );
 }
 return database[collectionName];
}
// Replace one collection/table
export async function setCollection(collectionName, data) {
 if (!Array.isArray(data)) {
   throw new Error(
     `Collection "${collectionName}" must be an array`
   );
 }
 const database = await readDatabase();
 database[collectionName] = data;
 await writeDatabase(database);
 return data;
}
// Add a record
export async function insert(collectionName, record) {
 const collection = await getCollection(collectionName);
 collection.push(record);
 await setCollection(collectionName, collection);
 return record;
}
// Update a record by ID
export async function updateById(
 collectionName,
 id,
 updatedRecord
) {
 const collection = await getCollection(collectionName);
 const index = collection.findIndex(
   (item) => String(item.id) === String(id)
 );
 if (index === -1) {
   return null;
 }
 collection[index] = {
   ...collection[index],
   ...updatedRecord,
   id: collection[index].id
 };
 await setCollection(collectionName, collection);
 return collection[index];
}
// Delete a record by ID
export async function deleteById(collectionName, id) {
 const collection = await getCollection(collectionName);
 const index = collection.findIndex(
   (item) => String(item.id) === String(id)
 );
 if (index === -1) {
   return null;
 }
 const deleted = collection.splice(index, 1)[0];
 await setCollection(collectionName, collection);
 return deleted;
}
// Find a record by ID
export async function findById(collectionName, id) {
 const collection = await getCollection(collectionName);
 return (
   collection.find(
     (item) => String(item.id) === String(id)
   ) || null
 );
}