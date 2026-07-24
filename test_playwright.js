const {chromium} = require('playwright')  
async function main() {  
  console.log('playwright loaded')  
  try {  
    const b = await chromium.launch()  
    console.log('browser launched')  
    await b.close()  
  } catch(e) {  
    console.log('error:', e.message)  
  }  
}  
main()  
