'use strict'

let _cid = Date.now()

const { Order } = require('bitfinex-api-node/lib/models')
const { prepareAmount, preparePrice } = require('./precision')
const isFinite = require('lodash/isFinite')
const delayPromise = require('./delay_promise')
const ocid = () => _cid++

const genOrder = (params, ws) => {
  if (!params.type) throw new Error('type required')
  if (params.price) params.price = preparePrice(params.price)
  if (params.priceTrailing) params.priceTrailing = preparePrice(params.priceTrailing)
  if (params.priceAuxLimit) params.priceAuxLimit = preparePrice(params.priceAuxLimit)
  if (params.amount) params.amount = prepareAmount(params.amount)

  const o = new Order({
    cid: ocid(),
    ...params
  }, ws)

  if (ws) {
    o.registerListeners()
  }

  return o
}

module.exports = (symbol, amount, dataDelay) => {
  const genBuy = (params = {}, ws) => {
    if (!params.symbol) params.symbol = symbol
    if (!isFinite(params.amount)) params.amount = amount
    if (params.amount < 0) params.amount *= -1 // ensure buy

    return genOrder(params, ws)
  }

  const genSell = (params = {}, ws) => {
    if (!params.symbol) params.symbol = symbol
    if (!isFinite(params.amount)) params.amount = amount * -1
    if (params.amount > 0) params.amount *= -1 // ensure sell

    return genOrder(params, ws)
  }

  return {
    genOrder,
    genBuy,
    genSell,

    genMarketBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_MARKET,
        ...params
      }, ws)
    },

    genMarketSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_MARKET,
        ...params
      }, ws)
    },

    genLimitBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_LIMIT,
        ...params
      }, ws)
    },

    genLimitSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_LIMIT,
        ...params
      }, ws)
    },

    genStopBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_STOP,
        ...params
      }, ws)
    },

    genStopSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_STOP,
        ...params
      }, ws)
    },

    genStopLimitBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_STOP_LIMIT,
        ...params
      }, ws)
    },

    genStopLimitSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_STOP_LIMIT,
        ...params
      }, ws)
    },

    genFOKBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_FOK,
        ...params
      }, ws)
    },

    genFOKSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_FOK,
        ...params
      }, ws)
    },

    genTrailingStopBuy (params = {}, ws) {
      return genBuy({
        type: Order.type.EXCHANGE_TRAILING_STOP,
        ...params
      }, ws)
    },

    genTrailingStopSell (params = {}, ws) {
      return genSell({
        type: Order.type.EXCHANGE_TRAILING_STOP,
        ...params
      }, ws)
    },

    // Does not update status values...
    cloneToVirtual (o, fxRate, virtualSymbol) {
      const vo = new Order(o)
      vo.symbol = virtualSymbol

      if (isFinite(+vo.price)) {
        vo.price = preparePrice(+vo.price * fxRate)
      }

      if (isFinite(+vo.priceAuxLimit)) {
        vo.priceAuxLimit = preparePrice(+vo.priceAuxLimit * fxRate)
      }

      if (isFinite(+vo.priceTrailing)) {
        vo.priceTrailing = preparePrice(+vo.priceTrailing * fxRate)
      }

      if (isFinite(+vo.priceAvg)) {
        vo.priceAvg = preparePrice(+vo.priceAvg * fxRate)
      }

      return vo
    },

    cancelOrder (o, ws, dataset, delay = dataDelay) {
      return delayPromise(ws.cancelOrder(o), delay).then(() => {
        if (dataset && dataset.updateOrder) {
          dataset.updateOrder(o)
        }
      })
    },

    submitOrder (o, ws, dataset, delay = dataDelay) {
      return delayPromise(ws.submitOrder(o), delay).then(() => {
        if (dataset && dataset.updateOrder) {
          dataset.updateOrder(o)
        }
      })
    },

    submitOrders (orders, ws, dataset, delay = dataDelay) {
      const p = Promise.all(orders.map(o => ws.submitOrder(o))).then(() => {
        if (dataset && dataset.updateOrder) {
          orders.forEach(o => dataset.updateOrder(o))
        }
      })

      return delayPromise(p, delay)
    },

    cancelOrders (orders, ws, dataset) {
      const p = Promise.all(orders.map(o => ws.cancelOrder(o))).then(() => {
        if (dataset && dataset.updateOrder) {
          orders.forEach(o => dataset.updateOrder(o))
        }
      })

      return delayPromise(p, dataDelay)
    }
  }
}
