'use strict'

const _isEmpty = require('lodash/isEmpty')
const eachSeries = require('async/eachSeries')
const debug = require('debug')('bfx:ws2-api-audit:test_suite')
const Promise = require('bluebird')

const runTestSuite = (steps, stepArgs) => {
  const { dataM, dataT } = stepArgs
  const refreshSnapshots = (sides = []) => {
    if (_isEmpty(sides) || sides.indexOf('maker') !== -1) {
      dataM.refreshSnapshots()
    }

    if (_isEmpty(sides) || sides.indexOf('taker') !== -1) {
      dataT.refreshSnapshots()
    }

    return Promise.resolve()
  }

  return runSteps(steps, {
    ...stepArgs,
    refreshSnapshots
  }).then(() => {
    debug('PASS')
  })
}

// TODO: Refactor, break out execStep/Before/After
const runSteps = (steps, stepArgs) => {
  return new Promise((resolve, reject) => {
    eachSeries(steps, (step, cb) => {
      const execStep = () => {
        debug('RUN (ID %s): %s...', step.id, step.label)

        return step.exec(stepArgs).then(() => {
          if (step.after) {
            debug('RUN AFTER (ID %s)', step.id)
            return runSteps(step.after, stepArgs)
              .then(() => cb(null, null))
          }

          return cb(null, null)
        }).catch(err => {
          debug('error [%s]: %s', step.id, err.stack)
          reject(err)
        })
      }

      if (Array.isArray(step.before)) {
        debug('RUN BEFORE (ID %s)', step.id)
        return runSteps(step.before, stepArgs)
          .then(execStep)
      }

      return execStep()

    }, (_, err) => {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}

const runTestSuites = (suites, stepArgs = {}, testArgs = {}) => {
  return new Promise((resolve, reject) => {
    if (testArgs.before) { // handle before
      debug('RUN BEFORE')
      return runSteps(testArgs.before, stepArgs)
        .then(resolve)
        .catch(reject)
    }

    resolve()
  }).then(() => {
    return new Promise((resolve, reject) => {
      eachSeries(suites, (suite, cb) => {
        return new Promise((resolve, reject) => { // handle beforeAll
          if (testArgs.beforeAll) {
            debug('RUN BEFORE ALL (ID %s)', suite.id)
            return runSteps(testArgs.beforeAll, stepArgs)
              .then(resolve)
              .catch(reject)
          }

          resolve()
        }).then(() => {
          debug('RUN SUITE (ID %s): %s', suite.id, suite.label)
          return runTestSuite(suite.steps, stepArgs) // run test suite
        }).then(() => {
          if (testArgs.afterAll) { // handle afterAll
            debug('RUN AFTER ALL (ID %s)', suite.id)
            return runSteps(testArgs.afterAll, stepArgs)
          }
        }).then(() => {
          cb(null, null)
        })
      }, (_, err) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
  }).then(() => {
    if (testArgs.after) { // handle after
      debug('RUN AFTER')
      return runSteps(testArgs.after, stepArgs)
    }
  })
}

module.exports = { runSteps, runTestSuite, runTestSuites }
