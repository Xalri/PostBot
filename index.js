const WOL_BASE_URL = process.env.WOL_BASE_URL?.replace(/\/$/, '');

if (!WOL_BASE_URL) {
    throw new Error('Missing WOL_BASE_URL environment variable');
}

const STATUS_URL = `${WOL_BASE_URL}/wol/status.php`;

async function wakeUp() {
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'switch');

        const response = await fetch(STATUS_URL, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.6,de;q=0.6',
                'Cache-Control': 'max-age=0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': 'PHPSESSID=9ff586bed467b6449d382d67d8d98bab',
                'Origin': WOL_BASE_URL,
                'Priority': 'u=0, i',
                'Referer': `${WOL_BASE_URL}/wol/`,
                'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Opera GX";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/122.0.0.0'
            }
        });

        const responseText = await response.json();
        
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
        console.log('Response Body:', responseText);
        
        return responseText.status ;
        
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

wakeUp();
