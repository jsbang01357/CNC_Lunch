const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22 || (major===22 && minor<22)){
  console.error('Node.js 22.22.0 이상이 필요합니다. 현재 버전: '+process.versions.node+'\nhttps://nodejs.org/ 에서 설치한 뒤 터미널을 다시 열어 주세요.');
  process.exit(1);
}
await import('./build.mjs');
await import('./dev.mjs');
