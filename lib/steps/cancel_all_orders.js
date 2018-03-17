'use strict'

const { isEmpty } = require('lodash')
const delayPromise = require('../util/delay_promise')

/**
 * @param {string[]} targets - 'maker' or/and 'taker'
 * @param {number?} dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = (targets = ['maker', 'taker'], dataDelay = 3000) => ({
  id: 'cancel_all',
  label: `cancel all open orders (${targets.join(', ')})`,
  actors: targets,
  exec: ({ dataM, dataT }) => {
    const promises = []

    if (targets.indexOf('maker') !== -1) {
      promises.push(dataM.cancelAllOpenOrders(dataDelay))
    }

    if (targets.indexOf('taker') !== -1) {
      promises.push(dataT.cancelAllOpenOrders(dataDelay))
    }

    return Promise.all(promises)
  }
})
