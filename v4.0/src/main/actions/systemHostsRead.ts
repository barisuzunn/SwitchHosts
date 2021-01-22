/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getSystemHostsPath from '@main/actions/getSystemHostsPath'
import * as fs from 'fs'

export default async (): Promise<string> => {
  const fn = await getSystemHostsPath()

  if (!fs.existsSync(fn)) {
    return ''
  }

  return await fs.promises.readFile(fn, 'utf-8')
}
