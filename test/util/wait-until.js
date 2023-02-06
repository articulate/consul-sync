const retry = async (test) => {
  if (await test()) {
    return true
  } else {
    return new Promise((resolve) => setTimeout(() => resolve(false), 100))
  }
}
  
module.exports = (test, timeout = 500) => async () => {
  const startedAt = Date.now()
  
  while (!(await retry(test))) {
    if (Date.now() - startedAt > timeout) {
      throw new Error('took too long')
    }
  }
}
  