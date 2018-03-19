'use strict'

const {
  assertOrderInserted, assertOrderRemoved, assertOrderNotInserted,
  assertOrderNotRemoved
} = require('../assert/orderbook')

const {
  assertNotFilled, assertFilled, assertPartiallyFilled
} = require('../assert/order')

// Utility wrapper to submit/assert multiple orders
module.exports = (orders, data, ws, submitOrders) => {
  return {
    submit () {
      return submitOrders(orders, ws, data)
    },

    assertInserted () {
      orders.forEach(o => assertOrderInserted(o, data))
    },

    assertRemoved () {
      orders.forEach(o => assertOrderRemoved(o, data))
    },

    assertNotFilled () {
      orders.forEach(o => assertNotFilled(o, data))
    },

    assertFilled () {
      orders.forEach(o => assertFilled(o, data))
    },

    assertPartiallyFilled () {
      orders.forEach(o => assertPartiallyFilled(o, data))
    },

    update () {
      orders.forEach(o => data.updateOrder(o))
    }
  }
}
