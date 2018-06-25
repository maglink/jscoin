![JScoin icon](https://github.com/maglink/jscoin/raw/master/app/icon/png/128x128.png)

# jscoin
[![best cryptocurrency](https://img.shields.io/badge/best%20cryptocurrency-yes-green.svg)](https://github.com/maglink/jscoin/releases)

Cryptocurrency on JavaScript

## Installation

Download application from [Releases page](https://github.com/maglink/jscoin/releases)

Usage source code:
```bash
npm i && npm start
```

Or run console version:
```bash
npm i && node console.js
```

For electron application NodeJS version required is v8.11.2. You can use `nvm` for set the version.

## Specifications

- Hash algoritm: SHA3-256
- Avg block interval: 10 min
- The maximum number of coins to be mined: 21 million
- Min transaction value: 0.01 coins
- Fixed fee for each transaction: 0.2%
- Difficulty correction each 144 blocks
- Older transactions are more important than new ones. Due to this, the credibility of unconfirmed transactions is higher.
- Simple raw block and trxs structure:
```json
{
    "hash": "00000ccda33c7f762878c2d2fc41e4dcd499bb0d98c4496186522ca6c0509db5",
    "header": {
        "version": 1,
        "height": 1,
        "timestamp": 1529942466995,
        "hashPrevBlock": "0000059d0639d6236c279362df7182e70c65ff4a43f74d61db0a39fbf411d46c",
        "hashMerkleRoot": "b69799212b07c3d37e82ba4de9b283aeb9d81ac4188cd68d47723773c381fbac",
        "target": "05ffffff",
        "noonce": 302
    },
    "trxs": [
        {
            "hash": "6cc497da70b904da1614bd6822d56d5b9440e7a7c281ef0de1cd19f8cea8461c",
            "body": {
                "to": "JSc16dpUbmfgZfd9ViuT8NFaHAWngtMcrkLsr",
                "amount": 7990867581,
                "fees": 0,
                "message": "China Extends Lead as Most Prolific Supercomputer Maker",
                "timestamp": 1529941158596
            }
        }
    ]
}
```
