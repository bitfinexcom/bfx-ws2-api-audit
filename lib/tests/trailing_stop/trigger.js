'use strict'

const assert = require('assert')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const genOrderSet = require('../../util/order_set')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated, assertCanceled
} = require('../../assert/order')

const { assertOrderInserted } = require('../../assert/orderbook')
const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')
const stepDelayUntilOB = require('../../steps/delay_until_ob')

/**
 * Submit TRAILING STOP sell & buy orders, and confirm that they follow the
 * ticker up & down
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
    genLimitBuy, genLimitSell, submitOrder, genTrailingStopBuy, cancelOrder,
    genTrailingStopSell, submitOrders,
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'trailing_stop_trigger',
    label: 'submit trailing stops & verify execution',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots(),
      stepDelayUntilOB({
        symbolT: symbol,
        symbolM: symbol,
      }),
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker LIMIT orders, to move price
      const oBuyLimitAM = genLimitBuy({ price: midPrice * 1.001 })
      const oBuyLimitBM = genLimitBuy({ price: midPrice * 1.002 })
      const oBuyLimitCM = genLimitBuy({ price: midPrice * 1.004 })
      const oSellLimitAM = genLimitSell({ price: midPrice * 1.008 })
      const oSellLimitBM = genLimitSell({ price: midPrice * 1.006 })
      const oSellLimitCM = genLimitSell({ price: midPrice * 1.005 })

      const makerOrders = genOrderSet([
        oBuyLimitAM,
        oBuyLimitBM,
        oBuyLimitCM,
        oSellLimitAM,
        oSellLimitBM,
        oSellLimitCM
      ], dataM, wsM, submitOrders)

      const delta = midPrice * 0.0025

      // Actual taker TRAILING STOP orders
      const oTrailingBuyT = genTrailingStopBuy({ priceTrailing: delta })
      const oTrailingSellT = genTrailingStopSell({ priceTrailing: delta })

      let initialTrailBid = null
      let initialTrailAsk = null

      return makerOrders.submit().then(() => {
        makerOrders.assertInserted()
        refreshSnapshots()

        return submitOrder(oTrailingBuyT, wsT, dataT) // trailing buy
      }).then(() => {
        makerOrders.update()
        makerOrders.assertNotFilled()
        assertNotFilled(oTrailingBuyT)

        initialTrailBid = oTrailingBuyT.price

        return cancelOrder(oSellLimitCM, wsM, dataM, 20 * 1000)
      }).then(() => {
        dataT.updateOrder(oTrailingBuyT)
        makerOrders.update()

        assertCanceled(oSellLimitCM)
        assertNotFilled(oTrailingBuyT)
        assert(oTrailingBuyT.price === initialTrailBid)

        refreshSnapshots()
        return cancelOrder(oSellLimitBM, wsM, dataM, 20 * 1000)
      }).then(() => {
        dataT.updateOrder(oTrailingBuyT)
        makerOrders.update()

        assertCanceled(oSellLimitBM)
        assertFullyFilled(oTrailingBuyT)
        assertFullyFilled(oSellLimitAM)
        assertWalletsUpdated(oTrailingBuyT, dataT, T_FEE)
        assertWalletsUpdated(oSellLimitAM, dataM, M_FEE)
        assert(oTrailingBuyT.priceAvg === oSellLimitAM.price)

        refreshSnapshots()

        // Start next chain of events, trailing sell
        return submitOrder(oTrailingSellT, wsT, dataT)
      }).then(() => {
        makerOrders.update()

        assertNotFilled(oBuyLimitAM)
        assertNotFilled(oBuyLimitBM)
        assertNotFilled(oBuyLimitCM)
        assertNotFilled(oTrailingSellT)

        initialTrailAsk = oTrailingSellT.price

        return cancelOrder(oBuyLimitCM, wsM, dataM, 20 * 1000)
      }).then(() => {
        dataT.updateOrder(oTrailingSellT)
        makerOrders.update()

        assertCanceled(oBuyLimitCM)
        assertNotFilled(oTrailingSellT)
        assert(oTrailingSellT.price === initialTrailAsk)

        refreshSnapshots()
        return cancelOrder(oBuyLimitBM, wsM, dataM, 20 * 1000)
      }).then(() => {
        dataT.updateOrder(oTrailingSellT)
        makerOrders.update()

        assertCanceled(oBuyLimitBM)
        assertFullyFilled(oTrailingSellT)
        assertFullyFilled(oBuyLimitAM)
        assertWalletsUpdated(oTrailingSellT, dataT, T_FEE)
        assertWalletsUpdated(oBuyLimitAM, dataM, M_FEE)
        assert(oTrailingSellT.priceAvg === oBuyLimitAM.price)

        refreshSnapshots()
      })
    }
  }
}
