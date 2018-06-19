![JScoin icon](https://github.com/maglink/jscoin/raw/master/app/icon/png/128x128.png)

# jscoin
Cryptocurrency on JavaScript


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

Specifications:
- Hash algoritm: SHA3-256
- Avg block interval: 10 min
- The maximum number of coins to be mined: 21 million
- Min transaction value: 0.01 coins
- Fixed fee for each transaction: 0.2%
- Difficulty correction each 100 blocks
- Older transactions are more important than new ones. Due to this, the credibility of unconfirmed transactions is higher.
- Simple raw block and trxs structure:
```json
{
    "hash": "00001a8ad6d494559f3eba9487e7841ae42554c7ab47f8fa238e353a629ac430",
    "header": {
        "version": 1,
        "height": 1,
        "timestamp": 1529308347790,
        "hashPrevBlock": "00007c108bbff8418615d34c14c9c91c4bbe12af54f4884fc2b17daeea658d3b",
        "hashMerkleRoot": "7b8768fa209f3592412d6b88565fdc30af1be0a103b1386ab88ceb883a598c42",
        "difficulty": 70,
        "noonce": 559
    },
    "trxs": [
        {
            "hash": "8582d7f5e01dd6ce943eedcce488bfdb0ff9c5e5ba7286cc3ccf3e7e8988753a",
            "body": {
                "to": "JSc1H6hXmr9TrHnP46HZus2yQjG93NUCWAwBi",
                "amount": 7990867581,
                "fees": 0,
                "message": "Investors Fret About a Trade War, but They Aren’t Fleeing the Stock Market",
                "timestamp": 1529308185729
            }
        }
    ]
}
```
