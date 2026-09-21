const fs=require('fs');
const {matchDomain}=require('../src/knowledge/classics-rules');
const files=[
 ['孝经','/root/.hermes/skills/daizhigev20/儒藏/孝经/孝经.txt'],
 ['论语','/root/.hermes/skills/daizhigev20/儒藏/四书/论语.txt'],
 ['孟子','/root/.hermes/skills/daizhigev20/儒藏/四书/孟子.txt'],
 ['大学','/root/.hermes/skills/daizhigev20/儒藏/四书/大学.txt'],
 ['中庸','/root/.hermes/skills/daizhigev20/儒藏/四书/中庸.txt'],
 ['道德经','/root/.hermes/skills/daizhigev20/道藏/道德经/道德经.txt'],
 ['南华经','/root/.hermes/skills/daizhigev20/道藏/南华经/南华经.txt'],
 ['四十二章经','/root/.hermes/skills/daizhigev20/佛藏/乾隆藏/小乘阿含部/佛说四十二章经.txt'],
 ['法句经','/root/.hermes/skills/daizhigev20/佛藏/乾隆藏/西土圣贤撰集/法句经.txt'],
 ['八大人觉经','/root/.hermes/skills/daizhigev20/佛藏/乾隆藏/大乘单译经/佛说八大人觉经.txt'],
 ['金刚经','/root/.hermes/skills/daizhigev20/佛藏/乾隆藏/大乘单译经/金刚经.txt'],
];
for (const [name,path] of files) {
  const text=fs.readFileSync(path,'utf-8');
  const d=matchDomain(text);
  console.log(name.padEnd(10)+' => '+(d?d.id:'null').padEnd(22)+' ('+text.length+' chars)');
}
