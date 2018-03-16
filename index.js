'use strict'

require('dotenv').config()

// process.env.DEBUG = 'bfx:ws2-api-audi*'
process.env.DEBUG = '*'

const {
  API_KEY_MAKER, API_SECRET_MAKER, API_KEY_TAKER, API_SECRET_TAKER
} = process.env

const DATA_DELAY = 7 * 1000
const INITIAL_MID_PRICE = 1.00 // only used if OB is empty
const SYMBOL = 'tIOTUSD'
const AMOUNT = 1000

const getBFX = require('./lib/util/get_bfx')
const runTestSuite = require('./lib/run_test_suite')
const stepCancelAllOrders = require('./lib/steps/cancel_all_orders')
const stepOpenWS = require('./lib/steps/open_ws')
const stepCloseWS = require('./lib/steps/close_ws')
const stepAuthWS = require('./lib/steps/auth_ws')
const stepSetupDataset = require('./lib/steps/setup_dataset')
const stepTeardownDataset = require('./lib/steps/teardown_dataset')
const stepDelay = require('./lib/steps/delay')

const testMarketBuy = require('./lib/test_steps/market_buy_from_limit')
const testMarketSell = require('./lib/test_steps/market_sell_to_limit')

const wsM = getBFX(API_KEY_MAKER, API_SECRET_MAKER).ws(2)
const wsT = getBFX(API_KEY_TAKER, API_SECRET_TAKER).ws(2)

runTestSuite({
  wsM,
  wsT,
  symbol: SYMBOL,
  amount: AMOUNT,
  steps: [
    stepOpenWS(),
    stepSetupDataset(),
    stepAuthWS(),
    stepDelay(5 * 1000), // wait for chan 0 data to arrive

    stepCancelAllOrders('maker'),
    stepCancelAllOrders('taker'),

    stepDelay(2 * 1000),

    testMarketBuy(SYMBOL, AMOUNT, INITIAL_MID_PRICE, DATA_DELAY),
    testMarketSell(SYMBOL, AMOUNT, INITIAL_MID_PRICE, DATA_DELAY),

    stepTeardownDataset(),
    stepCloseWS()
  ]
})
