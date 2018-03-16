'use strict'

const eachSeries = require('async/eachSeries')
const debug = require('debug')('bfx:ws2-api-audit:run_test_suite')
const Dataset = require('./dataset')

module.exports = ({ steps, symbol, amount, wsM, wsT }) => {
  const dataM = new Dataset(symbol, wsM, 'maker')
  const dataT = new Dataset(symbol, wsT, 'taker')

  eachSeries(steps, (step, cb) => {
    debug('RUN (ID %s): %s...', step.id, step.label)

    step.exec({ wsT, wsM, dataM, dataT, dataM, symbol, amount }).then(() => {
      cb(null, null)
    }).catch(err => {
      debug('error [%s]: %s', step.id, err.stack)
      process.exit(1) // can't catch if the cb() throws...
    })
  }, (res, err) => {
    if (err) {
      return debug('error: %s', err.stack)
    }

    debug('PASS')
  })
}
