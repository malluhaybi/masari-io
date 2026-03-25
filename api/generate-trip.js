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
    const chunkSize = 3;
    const to = Math.min(from + chunkSize - 1, totalDays);
    const hasMore = to < totalDays;

    // Build exclusion list from previous chunks
    var excludeRule = '';
    if (usedPlaces && usedPlaces.length > 0) {
      excludeRule = '\n\nIMPORTANT: Do NOT repeat any of these places that were already used in previous days: ' + usedPlaces.join(', ') + '. Choose DIFFERENT places for variety.';
    }

    const prompt = `Plan days ${from}-${to} of a ${totalDays}-day trip to ${destination}.
Budget: ${budget}. Type: ${tripType}. Food: ${food || 'any'}. Notes: ${notes || 'none'}.

RULES:
- ONLY real places on Google Maps
- Each day: 4 time slots (morning, lunch, afternoon, dinner)
- Each slot: 3 options, mark best as recommended:true
- All text Arabic, descriptions 1 sentence
- Do NOT repeat any place across the entire trip — every option must be unique
- Return ONLY JSON${excludeRule}

JSON:
{"days":[{"day_number":${from},"title":"Arabic","daily_cost_estimate":0,"slots":[{"time":"9:00 AM","slot_title":"Arabic","category":"attraction","options":[{"name":"place","name_ar":"Arabic","description":"Arabic","rating":4.5,"cost_usd":0,"duration_minutes":90,"maps_query":"place city","pros":["pro"],"cons":["con"],"recommended":true,"why_recommended":"Arabic"}]}]}],"tips":["tip1","tip2"]${from === 1 ? ',"trip_title":"Arabic","destination":"'+destination+'","total_days":'+totalDays+',"total_cost_estimate":0' : ''}}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON. No markdown. Never repeat a place name.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 5000,
      response_format: { type: 'json_object' },
    });

    const data = JSON.parse(response.choices[0].message.content);

    // Collect all place names from this chunk for the frontend to track
    var placesInChunk = [];
    if (data.days) {
      data.days.forEach(function(day) {
        (day.slots || []).forEach(function(slot) {
          (slot.options || []).forEach(function(opt) {
            opt.maps_url = 'https://www.google.com/maps/search/' + encodeURIComponent(opt.maps_query || opt.name);
            if (opt.name) placesInChunk.push(opt.name);
          });
        });
      });
    }

    return res.status(200).json({ 
      success: true, 
      data: data, 
      hasMore: hasMore,
      nextStartDay: hasMore ? to + 1 : null,
      placesUsed: placesInChunk
    });
  } catch (error) {
    console.error('API Error:', error.message || error);
    return res.status(500).json({ error: 'Failed', detail: error.message });
  }
}
