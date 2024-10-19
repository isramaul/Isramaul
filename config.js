module.exports = {
    // Number of workers for parallel processing
    numWorkers: 4,

    // Address to check. If not provided, use an empty string
    addressToCheck: process.env.ADDRESS_TO_CHECK || '',

    // API URLs for various blockchains. You can comment out or remove/add lines as needed.
    blockchains: {
      //  ethereum: 'https://rpc.ankr.com/eth/',
         ethereum: 'https://eth-mainnet.g.alchemy.com/v2/'
     // ethereum: 'https://mainnet.infura.io/v3/'
      // ethereum: 'https://nd-773-749-208.p2p.org'
        // Add or remove blockchain URLs as needed
    },
    // Maximum number of retry attempts for API requests
    maxRetries: 3, // Reduced max retries to avoid long delays

    // Delay between retries in milliseconds
    retryDelay: 5000, // Retry delay in milliseconds

    // Delay for retries after network errors in milliseconds
    networkErrorRetryDelay: 15000, // Retry delay for network errors

    // Maximum number of concurrent API requests
    concurrencyLimit: 4,

    // Minimum balance threshold for reporting
    minBalance: 0.01 // Minimum balance threshold
};
