'use strict'

const delayPromise = require('../util/delay_promise')

/**
 * Helper to generate an arbitrary delay in a test suite
 *
 * @param {number} delay - in milliseconds 
 * @return {Object} step
 */
module.exports = (delayMS = 5000) => ({
  id: 'delay',
  label: `delay execution for ${delayMS}ms`,
  actors: ['maker', 'taker'],
  exec: () => {
    return delayPromise(Promise.resolve(), delayMS)
  }
})
