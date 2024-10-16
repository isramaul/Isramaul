require('dotenv').config();  // Load environment variables
const { Worker } = require('worker_threads');  // Import worker threads
const path = require('path');  // For resolving paths
const fs = require('fs').promises;  // Promisified file system access
const config = require('./config');  // Config file that exports numWorkers, addressToCheck, etc.
const { numWorkers, blockchains, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance } = config;
const colors = require('colors');

const apiKeys = {};
let totalKeysPerFile = 0;
let totalChecked = 0, totalNonZero = 0;
let totalErrors = 0;
let totalRequestCount = 0;  // Track total request count

// Load API keys from the specified environment file
async function loadApiKeysFromEnvFile(envFileName) {
    const envContent = await fs.readFile(path.join(__dirname, envFileName), 'utf8');
    return envContent.split('\n')
        .filter(line => line.trim() && !line.startsWith('#') && line.includes('ALCHEMY_API_KEY_'))
        .map(line => line.split('=')[1].trim());
}

// Initialize API keys for all blockchains
async function initializeApiKeys() {
    await Promise.all(Object.keys(blockchains).map(async blockchain => {
        const keys = await loadApiKeysFromEnvFile(`./API_Keys/${blockchain}.env`);
        apiKeys[blockchain] = keys;
        totalKeysPerFile = Math.max(totalKeysPerFile, keys.length);  // Get the maximum number of keys per blockchain
    }));
}

console.log(`Address to check: `);  // Log address to check

// Worker Pool Class to manage multiple workers
class WorkerPool {
    constructor(numWorkers) {
        this.workers = Array.from({ length: numWorkers }, (_, i) => this.createWorker(i));  // Create workers
        this.freeWorkers = [...this.workers];  // Track free workers
        this.tasks = [];  // Task queue
    }

    // Create a worker and handle its messages, errors, and exit
    createWorker(index) {
        const worker = new Worker(path.join(__dirname, '3work.js'));  // Path to worker script (adjust if needed)
        worker.on('message', message => this.onMessage(worker, message));  // Handle worker messages
        worker.on('error', err => this.onError(worker, err));  // Handle worker errors
        worker.on('exit', code => this.onExit(worker, code, index));  // Handle worker exit
        console.log(`Worker ${index} started`);  // Log worker start
        return worker;
    }

    // Handle messages from worker
    onMessage(worker, message) {
        if (message.type === 'walletCheckResult') {
            totalChecked += Number(message.totalChecked);  // Update total checked wallets
            totalNonZero += Number(message.totalNonZero);
            console.log(`Worker updated: Checked wallets = ${message.totalChecked}, Non-Zero wallets = ${message.totalNonZero}`.green);
           // console.log(`Worker updated: Checked wallets = ${message.totalChecked}, Non-Zero wallets = ${message.totalNonZero}`);
           console.log(`Total Checked (all workers): ${totalChecked}`.green);
           // console.log(`Total Checked (all workers): ${totalChecked}`);
        } else if (message.type === 'error') {
            totalErrors += 1;  // Increment total errors
            console.log(`Worker encountered an error. Total Errors: ${totalErrors}`);
        } else if (message.type === 'requestCountUpdate') {
            totalRequestCount += message.requestCount;  // Update request count from worker
        }
        this.freeWorkers.push(worker);  // Add worker back to free pool
        this.runNextTask();  // Run next task in queue
    }

    // Handle worker errors
    onError(worker, err) {
        console.error(`Worker error: ${err}`);  // Log error
        this.freeWorkers.push(worker);  // Add worker back to free pool
        this.runNextTask();  // Run next task in queue
    }

    // Handle worker exit (restart the worker)
    onExit(worker, code, index) {
        console.log(`Worker ${index} exited with code ${code}`);  // Log worker exit
        this.workers[index] = this.createWorker(index);  // Restart the worker
        this.runNextTask();  // Run next task in queue
    }

    // Run the next task if there are free workers
    runNextTask() {
        if (this.freeWorkers.length && this.tasks.length) {
            const worker = this.freeWorkers.pop();  // Get a free worker
            worker.postMessage(this.tasks.shift());  // Send the task to the worker
        }
    }

    // Add a task to the queue
    addTask(task) {
        this.tasks.push(task);
        this.runNextTask();  // Try to run the task immediately if a worker is free
    }
}

// Main function to initialize workers and distribute tasks
async function main() {
    await initializeApiKeys();  // Load and initialize API keys

    const keysPerTypePerWorker = Math.floor(totalKeysPerFile / numWorkers);  // Distribute API keys to workers
    const pool = new WorkerPool(numWorkers);  // Create a pool of workers

    // Assign tasks to workers
    for (let i = 0; i < numWorkers; i++) {
        const workerApiKeys = {};  // API keys specific to this worker
        Object.keys(apiKeys).forEach(blockchain => {
            const start = i * keysPerTypePerWorker;
            workerApiKeys[blockchain] = apiKeys[blockchain].slice(start, start + keysPerTypePerWorker);  // Slice API keys for each worker
        });

        // Create the worker task
        pool.addTask({
            blockchains,
            apiKeys: workerApiKeys,
            workerId: i,  // Worker ID (0, 1, or 2)
            maxRetries,
            retryDelay,
            networkErrorRetryDelay,
            concurrencyLimit,
            minBalance
        });
    }
}

main();
