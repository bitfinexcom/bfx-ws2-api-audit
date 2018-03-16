'use strict'

/**
 * @param {string} target - 'maker' or 'taker'
 * @return {Object} step
 */
module.exports = (target) => ({
  id: 'cancel_all',
  label: `cancel all open orders (${target})`,
  exec: ({ wsM, wsT, dataM, dataT }) => {
    const ws = target === 'maker' ? wsM : wsT
    const data = target === 'maker' ? dataM : dataT
    const orders = Object.values(data.getOrders())

    if (orders.length === 0) {
      return Promise.resolve()
    }

    return ws.cancelOrders(orders)
  }
})
