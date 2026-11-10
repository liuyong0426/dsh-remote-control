/** Browser Loader never reaches its Node-side resolver, so these stubs are unreachable. */
const unreachable = (name: string) => async (): Promise<never> => { throw new Error(`远程浏览器不支持本机 Node 模块：${name}`) }

export default {
  writeFile: unreachable('fs/promises.writeFile'),
  rename: unreachable('fs/promises.rename'),
  mkdir: unreachable('fs/promises.mkdir'),
  readFile: unreachable('fs/promises.readFile'),
} as Record<string, unknown>
