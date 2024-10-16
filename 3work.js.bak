



const BATCH_SIZE = 40; // Adjust this as needed for batch size
const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const https = require('https');
const axios = require('axios');
const httpsAgent = new https.Agent({ keepAlive: true });
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const BigNumber = require('bignumber.js');
const colors = require('colors');
let pLimit;
const processedAddresses = new Set();  // Set for tracking processed addresses

(async () => {
    pLimit = (await import('p-limit')).default;

    async function compressData(data) {
        try {
            return await gzip(data);
        } catch (err) {
            await logDetailedError(err);
            throw err;
        }
    }

    async function decompressData(data) {
        try {
            return (await gunzip(data)).toString();
        } catch (err) {
            await logDetailedError(err);
            throw err;
        }
    }

    async function processResponse(response) {
        try {
            const data = response.headers['content-encoding']?.includes('gzip')
                ? await decompressData(response.data)
                : String.fromCharCode.apply(null, new Uint8Array(response.data));
            return JSON.parse(data)?.result ?? null;
        } catch (error) {
            await logDetailedError(error);
            throw error;
        }
    }

    async function getWalletData(address, apiKey, blockchainUrl, maxRetries, retryDelay, networkErrorRetryDelay) {
        const url = `${blockchainUrl}${apiKey}`;
        const requestData = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "eth_getBalance",
            params: [address, "latest"]
        };
        return retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay);
    }

    async function retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay, attempt = 1) {
        try {
            const compressedData = await compressData(JSON.stringify(requestData));
            const response = await axios.post(url, compressedData, {
                headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
                httpsAgent,
                responseType: 'arraybuffer',
                timeout: 1000000 // Set timeout to 10 seconds
            });
            return await processResponse(response);
        } catch (error) {
            if (attempt >= maxRetries) {
                await logDetailedError(error);
                return null;
            }

            const delay = (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH') ? networkErrorRetryDelay : retryDelay;
            await new Promise(resolve => setTimeout(resolve, delay));

            parentPort.postMessage({ type: 'error' });
            return retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay, attempt + 1);
        }
    }

    async function logDetailedError(error) {
        const logMessage = `Detailed error information: ${JSON.stringify(error, null, 2)}`;
        await fs.promises.appendFile('error_log.txt', logMessage + '\n');
    }
let totalChecked = 0;
    async function checkWallet(address, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance, mnemonic) {
    if (processedAddresses.has(address)) {
        return;  // Skip if the address is already processed
    }

    processedAddresses.add(address);
    const limit = pLimit(concurrencyLimit);
    
    try {
        const results = await Promise.all(
            blockchainParams.map(param => limit(() => getWalletBalance(address, param, maxRetries, retryDelay, networkErrorRetryDelay)))
        );
        const winFileData = await processResultsAndPrepareFiles(results, address, minBalance, mnemonic);
        
        
        console.log(` Balance: 0 | Wallet check: ${mnemonic}`.green);

        if (winFileData) {
            await fs.promises.appendFile('Win.txt', winFileData);
        }

        parentPort.postMessage({
            type: 'walletCheckResult',
            totalChecked: results.length,
            totalNonZero: winFileData ? 1 : 0
        });
    } catch (error) {
        await logDetailedError(error);
    }
}

//    }

    async function getWalletBalance(address, param, maxRetries, retryDelay, networkErrorRetryDelay) {
        try {
            const balance = await getWalletData(address, param.key, param.url, maxRetries, retryDelay, networkErrorRetryDelay);
            return { blockchain: param.name, balance };
        } catch (e) {
            await logDetailedError(e);
            return { blockchain: param.name, balance: null };
        }
    }

    async function processResultsAndPrepareFiles(results, address, minBalance, mnemonicPhrase) {
        let winFileData = '';

        results.forEach(({ blockchain, balance }) => {
            if (balance === null || balance === '0x0') return;
            const ethBalance = new BigNumber(balance, 16).dividedBy('1e18');
            if (ethBalance.isGreaterThan(minBalance)) {
                const walletDetails = mnemonicPhrase
                    ? `Address: ${address},\nMnemonic Phrase: ${mnemonicPhrase}\nBalance: ${ethBalance.toFixed(18)} ETH\nBlockchain: ${blockchain.toUpperCase()}\n\n`
                    : `Address: ${address},\nBalance: ${ethBalance.toFixed(18)} ETH\nBlockchain: ${blockchain.toUpperCase()}\n\n`;
                winFileData += walletDetails;
            }
        });

        return winFileData;
    }

    async function processBatch(batch, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance) {
        const mnemonicList = batch.map(line => {
            const parts = line.split(',');
            return {
                address: parts[0].trim(),
                mnemonic: parts[1] ? parts[1].trim() : null
            };
        });

        for (const { address, mnemonic } of mnemonicList) {
            await checkWallet(address, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance, mnemonic);
        }
    }

    // Load and save processed position
    const processedPositionFileWorker0 = 'processedPosition_worker0.txt'; // For worker 0
    const processedPositionFileWorker1 = 'processedPosition_worker1.txt'; // For worker 1
    const processedPositionFileWorker2 = 'processedPosition_worker2.txt'; // For worker 2

    async function loadProcessedPosition(workerId) {
        const fileName = workerId === 0 ? processedPositionFileWorker0 : workerId === 1 ? processedPositionFileWorker1 : processedPositionFileWorker2;
        try {
            const data = await fs.promises.readFile(fileName, 'utf8');
            return parseInt(data.trim(), 10);
        } catch (err) {
            return workerId === 0 || workerId === 2 ? 0 : Number.MAX_SAFE_INTEGER; // Worker 0 and 2 start at 0, Worker 1 starts at the end
        }
    }

    async function saveProcessedPosition(position, workerId) {
        const fileName = workerId === 0 ? processedPositionFileWorker0 : workerId === 1 ? processedPositionFileWorker1 : processedPositionFileWorker2;
        await fs.promises.writeFile(fileName, String(position), 'utf8');
    }

    // Begin reading the input file and process addresses
    parentPort.on('message', async (data) => {
        const { apiKeys, blockchains, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance, workerId } = data;

        const blockchainParams = Object.keys(apiKeys).map(key => ({
            key: apiKeys[key], name: key, url: blockchains[key]
        })).filter(param => param.key);

        // Load the processed position for the current worker
        let processedPosition = await loadProcessedPosition(workerId);
        console.log(`Worker ${workerId}: Loaded processed position: ${processedPosition}`); // Log loaded position

        let currentLine = 0;
        let lines = [];
        const fileStream = fs.createReadStream('ahits.txt');
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const linesArray = [];
        for await (const line of rl) {
            linesArray.push(line); // Collect all lines into an array
        }

        if (workerId === 0) {
            // Worker 0: Process odd lines 1, 3, 5, 7, etc. up to midLine
            const midLine = Math.floor(linesArray.length / 2);
            for (let i = 1; i <= midLine; i += 2) {
                if (i >= processedPosition) {
                    lines.push(linesArray[i]);

                    if (lines.length === BATCH_SIZE) {
                        await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                        lines = [];
                        processedPosition = i;
                        await saveProcessedPosition(processedPosition, workerId); // Save position after processing batch
                        console.log(`Worker 0: Saved processed position: ${processedPosition}`); // Log after saving position
                    }
                }
            }
        } else if (workerId === 1) {
            // Worker 1: Process from the end of the file to midLine
            const midLine = Math.floor(linesArray.length / 2);
            for (let i = processedPosition; i >= midLine; i--) {
                lines.push(linesArray[i]);

                if (lines.length === BATCH_SIZE) {
                    await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                    lines = [];
                    processedPosition = i;
                    await saveProcessedPosition(processedPosition, workerId); // Save position after processing batch
                    console.log(`Worker 1: Saved processed position: ${processedPosition}`); // Log after saving position
                }
            }
        } else if (workerId === 2) {
            // Worker 2: Process even lines 2, 4, 6, 8, etc. up to midLine
            const midLine = Math.floor(linesArray.length / 2);
            for (let i = 2; i <= midLine; i += 2) {
                if (i >= processedPosition) {
                    lines.push(linesArray[i]);

                    if (lines.length === BATCH_SIZE) {
                        await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                        lines = [];
                        processedPosition = i;
                        await saveProcessedPosition(processedPosition, workerId); // Save position after processing batch
                        console.log(`Worker 2: Saved processed position: ${processedPosition}`); // Log after saving position
                    }
                }
            }
        }

        // Process remaining lines in the final batch if it's less than the batch size
        if (lines.length > 0) {
            await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
        }

        await saveProcessedPosition(processedPosition, workerId);
        console.log(`Worker ${workerId}: Final processed position: ${processedPosition}`);  // Log final position after all lines are processed
    });

})();
