const NOTION_VERSION = "2022-06-28";

async function queryDB(dbId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`DB ${dbId}: ${json.message || res.status}`);
  return json;
}

exports.handler = async () => {
  const results = {};
  const errors = {};

  // Test each DB one by one
  const dbs = {
    chapters:     process.env.CHAPTERS_DB_ID,
    daily:        process.env.DAILY_LOG_DB_ID,
    punishments:  process.env.PUNISHMENTS_DB_ID,
    milestones:   process.env.MILESTONES_DB_ID,
  };

  // Check env vars exist
  const envCheck = {};
  Object.entries(dbs).forEach(([k,v]) => {
    envCheck[k] = v ? `SET (${v.substring(0,8)}...)` : "MISSING";
  });
  envCheck.token = process.env.NOTION_TOKEN 
    ? `SET (${process.env.NOTION_TOKEN.substring(0,10)}...)` 
    : "MISSING";

  // Try each database
  for (const [name, id] of Object.entries(dbs)) {
    if (!id) { errors[name] = "ID not set in env vars"; continue; }
    try {
      const data = await queryDB(id);
      results[name] = `OK - ${data.results?.length ?? 0} rows`;
    } catch(e) {
      errors[name] = e.message;
    }
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ envCheck, results, errors }, null, 2),
  };
};
