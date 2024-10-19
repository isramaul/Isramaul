const BATCH_SIZE = 20; 
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
const processedAddresses = new Set();  

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
            id: 1,
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
                timeout: 100000 // Set timeout to 10 seconds
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

    async function checkWallet(address, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance, mnemonic) {
        if (processedAddresses.has(address)) {
            return;  
        }

        processedAddresses.add(address);
        const limit = pLimit(concurrencyLimit);
        
        try {
            const results = await Promise.all(
                blockchainParams.map(param => limit(() => getWalletBalance(address, param, maxRetries, retryDelay, networkErrorRetryDelay)))
            );
            const winFileData = await processResultsAndPrepareFiles(results, address, minBalance, mnemonic);
            
            console.log(`Balance: 0 | Wallet check: ${mnemonic}`.green);

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

    async function getWalletBalance(address, param, maxRetries, retryDelay, networkErrorRetryDelay) {
        try {
            const balance = await getWalletData(address, param.key, param.url, maxRetries, retryDelay, networkErrorRetryDelay);
            return { blockchain: param.name, balance };
        } catch (e) {
            await logDetailedError(e);
            return { blockchain: param.name, balance: null };
        }
    }

    async function processResultsAndPrepareFiles(results, address, minBalance, mnemonic) {
        let winFileData = '';

        results.forEach(({ blockchain, balance }) => {
            if (balance === null || balance === '0x0') return;
            const ethBalance = new BigNumber(balance, 16).dividedBy('1e18');
            if (ethBalance.isGreaterThan(minBalance)) {
                const walletDetails = mnemonic
                    ? `Address: ${address},\nMnemonic Phrase: ${mnemonic}\nBalance: ${ethBalance.toFixed(18)} ETH\nBlockchain: ${blockchain.toUpperCase()}\n\n`
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

    const processedPositionFileWorker0 = 'processedPosition_worker0.txt'; 
    const processedPositionFileWorker1 = 'processedPosition_worker1.txt'; 
    const processedPositionFileWorker2 = 'processedPosition_worker2.txt'; 
    const processedPositionFileWorker3 = 'processedPosition_worker3.txt'; 

    async function loadProcessedPosition(workerId) {
        const fileName = workerId === 0 ? processedPositionFileWorker0 : workerId === 1 ? processedPositionFileWorker1 : workerId === 2 ? processedPositionFileWorker2 : processedPositionFileWorker3;
        try {
            const data = await fs.promises.readFile(fileName, 'utf8');
            return parseInt(data.trim(), 10);
        } catch (err) {
            return (workerId === 0 || workerId === 2) ? 0 : Number.MAX_SAFE_INTEGER; 
        }
    }

    async function saveProcessedPosition(position, workerId) {
        const fileName = workerId === 0 ? processedPositionFileWorker0 : workerId === 1 ? processedPositionFileWorker1 : workerId === 2 ? processedPositionFileWorker2 : processedPositionFileWorker3;
        await fs.promises.writeFile(fileName, String(position), 'utf8');
    }

    parentPort.on('message', async (data) => {
        const { apiKeys, blockchains, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance, workerId } = data;

        const blockchainParams = Object.keys(apiKeys).map(key => ({
            key: apiKeys[key], name: key, url: blockchains[key]
        })).filter(param => param.key);

        let processedPosition = await loadProcessedPosition(workerId);
        console.log(`Worker ${workerId}: Loaded processed position: ${processedPosition}`); 

        let currentLine = 0;
        let lines = [];
        const fileStream = fs.createReadStream('ahits.txt');
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const linesArray = [];
        for await (const line of rl) {
            linesArray.push(line); 
        }

        const midLine = Math.floor(linesArray.length / 2);

        if (workerId === 0) {
            for (let i = 1; i <= midLine; i += 2) {
                if (i >= processedPosition) {
                    lines.push(linesArray[i]);

                    if (lines.length === BATCH_SIZE) {
                        await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                        lines = [];
                        processedPosition = i;
                        await saveProcessedPosition(processedPosition, workerId); 
                        console.log(`Worker 0: Saved processed position: ${processedPosition}`); 
                    }
                }
            }
        } else if (workerId === 1) {
            for (let i = processedPosition; i >= midLine; i -= 2) {
                lines.push(linesArray[i]);

                if (lines.length === BATCH_SIZE) {
                    await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                    lines = [];
                    processedPosition = i;
                    await saveProcessedPosition(processedPosition, workerId); 
                    console.log(`Worker 1: Saved processed position: ${processedPosition}`); 
                }
            }
        } else if (workerId === 2) {
            for (let i = 2; i <= midLine; i += 2) {
                if (i >= processedPosition) {
                    lines.push(linesArray[i]);

                    if (lines.length === BATCH_SIZE) {
                        await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                        lines = [];
                        processedPosition = i;
                        await saveProcessedPosition(processedPosition, workerId); 
                        console.log(`Worker 2: Saved processed position: ${processedPosition}`); 
                    }
                }
            }
        } else if (workerId === 3) {
            for (let i = processedPosition; i >= midLine; i -= 2) {
                lines.push(linesArray[i]);

                if (lines.length === BATCH_SIZE) {
                    await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
                    lines = [];
                    processedPosition = i;
                    await saveProcessedPosition(processedPosition, workerId); 
                    console.log(`Worker 3: Saved processed position: ${processedPosition}`); 
                }
            }
        }

        if (lines.length > 0) {
            await processBatch(lines, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
        }

        await saveProcessedPosition(processedPosition, workerId);
        console.log(`Worker ${workerId}: Final processed position: ${processedPosition}`); 
    });

})();
