// [yougao 改造] 离线模式配置文件
const config = {
  isOffline: true, // 默认开启离线模式
  localStoragePath: '~/.yougao/workflows',
  disableCloudApi: true // 禁用所有云端接口
};

export default config;