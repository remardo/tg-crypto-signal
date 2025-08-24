src/
├── config/
│   ├── database.js
│   ├── redis.js
│   └── app.js
├── controllers/
│   ├── channelController.js
│   ├── signalController.js
│   ├── positionController.js
│   └── dashboardController.js
├── services/
│   ├── telegramService.js
│   ├── signalRecognitionService.js
│   ├── bingxService.js
│   ├── executionService.js
│   ├── positionService.js
│   └── channelService.js
├── models/
│   ├── Channel.js
│   ├── Signal.js
│   ├── Position.js
│   └── Account.js
├── middleware/
│   ├── auth.js
│   ├── validation.js
│   └── errorHandler.js
├── routes/
│   ├── channels.js
│   ├── signals.js
│   ├── positions.js
│   └── dashboard.js
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── connection.js
├── utils/
│   ├── logger.js
│   ├── calculator.js
│   └── helpers.js
├── jobs/
│   ├── signalProcessor.js
│   └── priceUpdater.js
├── websocket/
│   └── socketHandler.js
└── server.js

frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Dashboard/
│   │   ├── Signals/
│   │   ├── Positions/
│   │   ├── Channels/
│   │   └── Common/
│   ├── hooks/
│   ├── services/
│   ├── utils/
│   └── App.js
├── package.json
└── README.md

docs/
├── API.md
├── SETUP.md
└── DEPLOYMENT.md