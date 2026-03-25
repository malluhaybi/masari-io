import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { destination, days, budget, tripType, food, notes, startDay, usedPlaces } = req.body;
    if (!destination || !days || !budget) return res.status(400).json({ error: 'Missing fields' });
    const totalDays = parseInt(days) || 3;
    const from = parseInt(startDay) || 1;
    const chunkSize = 4;
    const to = Math.min(from + chunkSize - 1, totalDays);
    const hasMore = to < totalDays;
    var excludeRule = '';
    if (usedPlaces && usedPlaces.length > 0) {
      excludeRule = '\nALREADY USED (do NOT repeat): ' + usedPlaces.slice(-30).join(', ');
    }
    const prompt = `Plan days ${from}-${to} of a ${totalDays}-day trip to ${destination}.
Budget: ${budget}. Type: ${tripType}. Food: ${food || 'any'}. Notes: ${notes || 'none'}.
CRITICAL RULES:
1. ONLY real places on Google Maps
2. If destination is a COUNTRY: split days logically between cities (stay 2-3 days per city). Add transport between cities.
3. Each day: 3 time slots (morning, lunch+afternoon, evening)
4. Each slot: 2 options, mark best as recommended:true
5. MUST include realistic cost_usd (never 0)
6. daily_cost_estimate = sum of recommended costs
7. Keep descriptions SHORT (1 sentence Arabic)
8. When changing cities, first slot = transport${excludeRule}
JSON:
{"days":[{"day_number":${from},"title":"Arabic","city":"city name","daily_cost_estimate":150,"slots":[{"time":"9:00 AM","slot_title":"Arabic","category":"attraction|restaurant|transport","options":[{"name":"place","name_ar":"Arabic","description":"Arabic","rating":4.5,"cost_usd":25,"duration_minutes":90,"maps_query":"place city","pros":["pro"],"cons":["con"],"recommended":true,"why_recommended":"Arabic"}]}]}]${from === 1 ? ',"trip_title":"Arabic","destination":"'+destination+'","total_days":'+totalDays+',"total_cost_estimate":0,"tips":["tip1","tip2","tip3"]' : ',"tips":["tip"]'}}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'Return ONLY valid JSON. All costs non-zero USD. Never repeat places.' }, { role: 'user', content: prompt }],
      temperature: 0.7, max_tokens: 4000, response_format: { type: 'json_object' },
    });
    const data = JSON.parse(response.choices[0].message.content);
    var placesInChunk = [], totalCost = 0;
    if (data.days) {
      data.days.forEach(function(day) {
        var dayCost = 0;
        (day.slots || []).forEach(function(slot) {
          (slot.options || []).forEach(function(opt) {
            opt.maps_url = 'https://www.google.com/maps/search/' + encodeURIComponent(opt.maps_query || opt.name);
            if (opt.name) placesInChunk.push(opt.name);
            if (opt.recommended && opt.cost_usd) dayCost += opt.cost_usd;
          });
        });
        if (!day.daily_cost_estimate || day.daily_cost_estimate === 0) day.daily_cost_estimate = dayCost;
        totalCost += day.daily_cost_estimate;
      });
    }
    if (!data.total_cost_estimate) data.total_cost_estimate = totalCost;
    return res.status(200).json({ success: true, data, hasMore, nextStartDay: hasMore ? to + 1 : null, placesUsed: placesInChunk });
  } catch (error) {
    console.error('API Error:', error.message || error);
    return res.status(500).json({ error: 'Failed', detail: error.message });
  }
}
