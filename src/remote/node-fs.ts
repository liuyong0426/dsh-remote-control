/** Browser Loader never reaches its Node-side resolver, so these stubs are unreachable. */
const unreachable = (name: string) => (): never => { throw new Error(`远程浏览器不支持本机 Node 模块：${name}`) }

export default {
  existsSync: unreachable('fs.existsSync'),
  readFileSync: unreachable('fs.readFileSync'),
  writeFileSync: unreachable('fs.writeFileSync'),
  statSync: unreachable('fs.statSync'),
} as Record<string, unknown>
