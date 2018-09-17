'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const genOrderSet = require('../../util/order_set')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

const { DUST } = require('../../config')

/**
 * Submit TRAILING STOP sell & buy orders, and confirm that they follow the
 * top bid/ask up & down
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
    submitOrder, genTrailingStopBuy, genTrailingStopSell, submitOrders,
    cancelOrders, cancelOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'trailing_stop_trail',
    label: 'submit trailing stops & verify trailing behaviour',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker LIMIT orders, to move price
      const oBuyLimitAM = genLimitBuy({ price: midPrice * 1.0001 })
      const oBuyLimitBM = genLimitBuy({ price: midPrice * 1.0002 })
      const oBuyLimitCM = genLimitBuy({ price: midPrice * 1.0003 })

      const oSellLimitAM = genLimitSell({ price: midPrice * 1.0006 })
      const oSellLimitBM = genLimitSell({ price: midPrice * 1.0005 })
      const oSellLimitCM = genLimitSell({ price: midPrice * 1.0004 })

      const delta = midPrice * 0.1

      // Actual taker TRAILING STOP orders
      const oTrailingBuyT = genTrailingStopBuy({ priceTrailing: delta })
      const oTrailingSellT = genTrailingStopSell({ priceTrailing: delta })
      const qCurrency = oTrailingBuyT.getQuoteCurrency()

      // Taker orders to move last price
      const oMarketBuyAT = genMarketBuy()
      const oMarketBuyBT = genMarketBuy()
      const oMarketBuyCT = genMarketBuy()
      const oMarketSellAT = genMarketSell()
      const oMarketSellBT = genMarketSell()
      const oMarketSellCT = genMarketSell()

      // Set initial last price
      return submitOrder(oSellLimitAM, wsM, dataM).then(() => {
        return submitOrder(oMarketBuyAT, wsT, dataT, 15 * 1000)
      }).then(() => {
        dataM.updateOrder(oSellLimitAM)

        assertFullyFilled(oSellLimitAM)
        assertWalletsUpdated(oSellLimitAM, dataM, M_FEE)

        assertFullyFilled(oMarketBuyAT)
        assertWalletsUpdated(oMarketBuyAT, dataT, T_FEE)

        return submitOrder(oTrailingBuyT, wsT, dataT) // submit trailing buy
      }).then(() => {
        assertNotFilled(oTrailingBuyT)
        refreshSnapshots()

        // bump top ask
        return submitOrder(oSellLimitBM, wsM, dataM).then(() => {
          return submitOrder(oMarketBuyBT, wsT, dataT, 15 * 1000)
        })
      }).then(() => {
        dataM.updateOrder(oSellLimitBM)
        dataT.updateOrder(oTrailingBuyT)

        assertFullyFilled(oSellLimitBM)
        assertWalletsUpdated(oSellLimitBM, dataM, M_FEE)

        assertFullyFilled(oMarketBuyBT)
        assertWalletsUpdated(oMarketBuyBT, dataT, T_FEE)

        assertNotFilled(oTrailingBuyT)
        assert(
          Math.abs((oTrailingBuyT.price - oSellLimitBM.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        // bump top ask
        return submitOrder(oSellLimitCM, wsM, dataM).then(() => {
          return submitOrder(oMarketBuyCT, wsT, dataT, 15 * 1000)
        })
      }).then(() => {
        dataM.updateOrder(oSellLimitCM)
        dataT.updateOrder(oTrailingBuyT)

        assertFullyFilled(oSellLimitCM)
        assertWalletsUpdated(oSellLimitCM, dataM, M_FEE)

        assertFullyFilled(oMarketBuyCT)
        assertWalletsUpdated(oMarketBuyCT, dataT, T_FEE)

        assertNotFilled(oTrailingBuyT)
        assert(
          Math.abs((oTrailingBuyT.price - oSellLimitCM.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        // Repeat in reverse
        return cancelOrder(oTrailingBuyT, wsT, dataT)
      }).then(() => {
        refreshSnapshots()

        // set last price
        return submitOrder(oBuyLimitAM, wsM, dataM).then(() => {
          return submitOrder(oMarketSellAT, wsT, dataT)
        })
      }).then(() => {
        dataM.updateOrder(oBuyLimitAM)

        assertFullyFilled(oBuyLimitAM)
        assertWalletsUpdated(oBuyLimitAM, dataM, M_FEE)

        assertFullyFilled(oMarketSellAT)
        assertWalletsUpdated(oMarketSellAT, dataT, T_FEE)

        refreshSnapshots()

        return submitOrder(oTrailingSellT, wsT, dataT) // submit trailing sell
      }).then(() => {
        assertNotFilled(oTrailingSellT)
        refreshSnapshots()

        // bump last price
        return submitOrder(oBuyLimitBM, wsM, dataM).then(() => {
          return submitOrder(oMarketSellBT, wsT, dataT)
        })
      }).then(() => {
        dataM.updateOrder(oBuyLimitBM)
        dataT.updateOrder(oTrailingSellT)

        assertFullyFilled(oBuyLimitBM)
        assertWalletsUpdated(oBuyLimitBM, dataM, M_FEE)

        assertFullyFilled(oMarketSellBT)
        assertWalletsUpdated(oMarketSellBT, dataT, T_FEE)

        assertNotFilled(oTrailingSellT)

        assert(
          Math.abs((oBuyLimitBM.price - oTrailingSellT.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        // bump last price
        return submitOrder(oBuyLimitCM, wsM, dataM).then(() => {
          return submitOrder(oMarketSellCT, wsT, dataT)
        })
      }).then(() => {
        dataM.updateOrder(oBuyLimitCM)
        dataT.updateOrder(oTrailingSellT)

        assertFullyFilled(oBuyLimitCM)
        assertWalletsUpdated(oBuyLimitCM, dataM, M_FEE)

        assertFullyFilled(oMarketSellCT)
        assertWalletsUpdated(oMarketSellCT, dataT, T_FEE)

        assertNotFilled(oTrailingSellT)

        assert(
          Math.abs((oBuyLimitCM.price - oTrailingSellT.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()
      })
    }
  }
}
