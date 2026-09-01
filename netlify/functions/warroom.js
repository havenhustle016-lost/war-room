const NOTION_VERSION = "2022-06-28";

async function queryDB(dbId, filter = null) {
  const body = filter ? { filter } : {};
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  return res.json();
}

exports.handler = async () => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [chapters, daily, punishments, milestones] = await Promise.all([
      queryDB(process.env.CHAPTERS_DB_ID),
      queryDB(process.env.DAILY_LOG_DB_ID, {
        property: "Date",
        date: { equals: today }
      }),
      queryDB(process.env.PUNISHMENTS_DB_ID),
      queryDB(process.env.MILESTONES_DB_ID),
    ]);

    const chRows = chapters.results || [];
    const doneChapters = chRows.filter(r => {
      const s = r.properties?.Status?.status?.name || "";
      return s === "Done" || s === "Revised";
    }).length;

    const bySubject = {
      Maths:    { done:0, total:0 },
      Physics:  { done:0, total:0 },
      Chemistry:{ done:0, total:0 }
    };
    chRows.forEach(r => {
      const subj = r.properties?.Subject?.select?.name || "Other";
      const status = r.properties?.Status?.status?.name || "";
      if (bySubject[subj]) {
        bySubject[subj].total++;
        if (status === "Done" || status === "Revised") bySubject[subj].done++;
      }
    });

    const todayRow = (daily.results || [])[0];
    const blockNames = ["Maths Block","Physics Block","Chem Block","Run Done","Workout Done","Finance Block","Night Revision"];
    let blocksDone = 0;
    if (todayRow) {
      blockNames.forEach(name => {
        if (todayRow.properties?.[name]?.checkbox) blocksDone++;
      });
    }

    const punishRows = punishments.results || [];
    const pendingPunishments = punishRows.filter(r => !r.properties?.Served?.checkbox).length;

    const msRows = milestones.results || [];
    const doneMilestones = msRows.filter(r => r.properties?.Conquered?.checkbox).length;

    const startDate = new Date("2026-08-27");
    const dayNum = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        day: dayNum,
        chapters: { done: doneChapters, total: chRows.length, bySubject },
        blocks:   { done: blocksDone, total: 7 },
        punishments: { pending: pendingPunishments },
        milestones: { done: doneMilestones, total: msRows.length },
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
