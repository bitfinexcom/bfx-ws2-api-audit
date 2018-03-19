'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit an OCO limit order and verify each side can execute, and that they
 * cancel each other.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number?} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialMid, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'oco_exec',
    label: 'submit an OCO and verify proper execution',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp

      // Generates OCOs with targets at mid-ish price
      const getOCOBuy = () => genLimitBuy({
        price: midPrice * 1.01,
        priceAuxLimit: midPrice * 1.1,
        oco: true
      })

      const getOCOSell = () => genLimitSell({
        price: midPrice * 1.02,
        priceAuxLimit: midPrice * 1.001,
        oco: true
      })

      // Pair of buy/sell orders used to set initial lastPrice
      const lastPriceBuyT = genMarketBuy()
      const lastPriceSellM = genLimitSell({
        price: midPrice * 1.01
      })

      // Pair of buy/sell orders used to trigger buy OCO stop
      const stopTriggerBuyT = genMarketBuy()
      const stopTriggerSellM = genLimitSell({
        price: midPrice * 1.2
      })

      // Pair of buy/sell orders used to trigger sell OCO stop
      const stopTriggerSellT = genMarketSell()
      const stopTriggerBuyM = genLimitBuy({
        price: midPrice * 1.001
      })

      const stopTriggerFillBuyT = genLimitBuy({ // lower price, taken by stop
        price: midPrice * 1.001
      })

      // Actual OCO orders used for testing, re-initialised for each attempt
      let ocoBuyM = getOCOBuy() // needed for new CIDs later
      let ocoSellM = getOCOSell()

      // Orders to take OCO limit prices
      const oBuyLimitT = genLimitBuy({ price: midPrice * 1.02 })
      const oSellLimitT = genLimitSell({ price: midPrice * 1.01 })

      // Orders to take OCO stop prices
      const oBuyStopT = genLimitBuy({ price: midPrice * 1.001 })
      const oSellStopT = genLimitSell({ price: midPrice * 1.1 })

      // Submit first 2 orders to set last price
      return submitOrder(lastPriceSellM, wsM, dataM).then(() => {
        return submitOrder(lastPriceBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(lastPriceSellM)

        assertFullyFilled(lastPriceSellM)
        assertFullyFilled(lastPriceBuyT)
        assertWalletsUpdated(lastPriceSellM, dataM, M_FEE)
        assertWalletsUpdated(lastPriceBuyT, dataT, T_FEE)
        assert(dataT.lastPrice(), lastPriceSellM.price)
      }).then(() => {
        return submitOrder(ocoSellM, wsM, dataM) // Submit first OCO order
      }).then(() => {
        assertNotFilled(ocoSellM)
        assertOrderInserted(ocoSellM, dataM)
        refreshSnapshots()

        return submitOrder(oBuyLimitT, wsT, dataT) // buy at limit price
      }).then(() => {
        dataM.updateOrder(ocoSellM)

        assertFullyFilled(ocoSellM)
        assertFullyFilled(oBuyLimitT)
        assertOrderRemoved(ocoSellM, dataM)
        assertWalletsUpdated(ocoSellM, dataM, M_FEE)
        assertWalletsUpdated(oBuyLimitT, dataT, T_FEE)
        refreshSnapshots()

        // re-gen and submit sell OCO for stop test
        ocoSellM = getOCOSell()
        return submitOrder(ocoSellM, wsM, dataM)
      }).then(() => {
        assertNotFilled(ocoSellM)
        assertOrderInserted(ocoSellM, dataM)
        refreshSnapshots()

        // execute order pair at stop price to trigger it
        return submitOrder(stopTriggerBuyM, wsM, dataM)
      }).then(() => {
        return submitOrder(stopTriggerFillBuyT, wsT, dataT) // taken by stop
      }).then(() => {
        dataM.updateOrder(ocoSellM)

        assertNotFilled(ocoSellM)
        assertNotFilled(stopTriggerBuyM)
        assertNotFilled(stopTriggerFillBuyT)
        assertOrderInserted(stopTriggerBuyM, dataM)
        assertOrderInserted(stopTriggerFillBuyT, dataT)

        refreshSnapshots()

        return submitOrder(stopTriggerSellT, wsT, dataT) // trigger stop
      }).then(() => { // stop & stop trigger both executed
        const stop = dataM.getStopForOCO(ocoSellM)

        dataM.updateOrder(stopTriggerBuyM)
        dataM.updateOrder(ocoSellM)
        dataT.updateOrder(stopTriggerFillBuyT)

        assertFullyFilled(stopTriggerBuyM)
        assertFullyFilled(stopTriggerSellT)
        assertFullyFilled(stop)
        assertFullyFilled(stopTriggerFillBuyT)

        assertWalletsUpdated(stopTriggerBuyM, dataM, M_FEE)
        assertWalletsUpdated(stopTriggerSellT, dataT, T_FEE)
        assertWalletsUpdated(stop, dataM, T_FEE)
        assertWalletsUpdated(stopTriggerFillBuyT, dataT, M_FEE)

        assert(stopTriggerFillBuyT.price === dataT.lastPrice())
        assert(stop.priceAvg === dataM.lastPrice())

        assertOrderRemoved(stopTriggerBuyM, dataM)
        assertOrderRemoved(stopTriggerFillBuyT, dataT)

        refreshSnapshots()
      })
    }
  }
}
