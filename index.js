'use strict'

require('dotenv').config()

// process.env.DEBUG = 'bfx:ws2-api-audi*'
// process.env.DEBUG = 'bfx:ws2-api-audit:test_suite'
process.env.DEBUG = '*'

const {
  API_KEY_MAKER, API_SECRET_MAKER, API_KEY_TAKER, API_SECRET_TAKER
} = process.env

const DATA_DELAY = 7 * 1000
const INITIAL_MID_PRICE = 30.00 // only used if OB is empty
const INITIAL_LAST_PRICE = 30.00 // only used if ticker not received
const SYMBOL = 'tETHUSD'
const AMOUNT = 2

const Dataset = require('./lib/dataset')
const { runTestSuites } = require('./lib/test_suite')
const stepOpenWS = require('./lib/steps/open_ws')
const stepCloseWS = require('./lib/steps/close_ws')
const stepAuthWS = require('./lib/steps/auth_ws')
const stepSetupDataset = require('./lib/steps/setup_dataset')
const stepTeardownDataset = require('./lib/steps/teardown_dataset')
const stepDelay = require('./lib/steps/delay')
const getBFX = require('./lib/util/get_bfx')

// TODO: Break this out on the environment
const symbols = [
  'tBTCUSD',
  'tETHBTC',
  'tETHUSD',
  'tIOTUSD',
  'tIOTBTC',
  'tIOTETH',
  'tIFXUSD',

  // Virtual
  'tBTCEUR',
  'tBTCJPY',
  'tIOTEUR'
]

const bfxM = getBFX(API_KEY_MAKER, API_SECRET_MAKER)
const bfxT = getBFX(API_KEY_TAKER, API_SECRET_TAKER)

const wsM = bfxM.ws(2)
const wsT = bfxT.ws(2)
const restM = bfxM.rest(2)
const restT = bfxT.rest(2)

const dataM = new Dataset(symbols, wsM, 'maker')
const dataT = new Dataset(symbols, wsT, 'taker')

const orderTestArgs = {
  symbol: SYMBOL,
  amount: AMOUNT,
  initialMid: INITIAL_MID_PRICE,
  initialLast: INITIAL_LAST_PRICE,
  dataDelay: DATA_DELAY
}

runTestSuites([
  /*require('./lib/tests/virtual_obs')({
    ...orderTestArgs,

    primaryPair: 'tBTCUSD',
    virtualPair: 'tBTCJPY'
  }),*/

  require('./lib/tests/limit')(orderTestArgs),
  require('./lib/tests/market')(orderTestArgs),
  require('./lib/tests/stop')(orderTestArgs),
  require('./lib/tests/stop_limit')(orderTestArgs),
  require('./lib/tests/fok')(orderTestArgs),
  require('./lib/tests/trailing_stop')(orderTestArgs)
], {
  wsM,
  wsT,
  dataM,
  dataT,
  restM,
  restT,
  symbol: SYMBOL,
  amount: AMOUNT,
  dataDelay: DATA_DELAY
}, {
  before: [
    stepOpenWS(),
    stepSetupDataset(),
    stepAuthWS(),
    stepDelay(1 * 1000), // wait for chan 0 data to arrive
  ],

  after: [
    stepTeardownDataset(),
    stepCloseWS()
  ]
})
