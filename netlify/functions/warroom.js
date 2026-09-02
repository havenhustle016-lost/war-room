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
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || res.status);
  return json;
}

// Safe fetch — never crashes, returns empty on error
async function safeQuery(dbId, filter = null) {
  try {
    return await queryDB(dbId, filter);
  } catch(e) {
    console.log("DB error:", e.message);
    return { results: [] };
  }
}

exports.handler = async () => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // All 4 run independently — one failure won't crash the rest
    const [chapters, daily, punishments, milestones] = await Promise.all([
      safeQuery(process.env.CHAPTERS_DB_ID),
      safeQuery(process.env.DAILY_LOG_DB_ID, {
        property: "Date",
        date: { equals: today }
      }),
      safeQuery(process.env.PUNISHMENTS_DB_ID),
      safeQuery(process.env.MILESTONES_DB_ID),
    ]);

    // ── Chapters ──
    const chRows = chapters.results || [];
    const doneChapters = chRows.filter(r => {
      try {
        const s = r.properties?.Status?.status?.name || "";
        return s === "Done" || s === "Revised";
      } catch(e) { return false; }
    }).length;

    const bySubject = {
      Maths:     { done:0, total:0 },
      Physics:   { done:0, total:0 },
      Chemistry: { done:0, total:0 },
    };
    chRows.forEach(r => {
      try {
        const subj = r.properties?.Subject?.select?.name || "";
        const s    = r.properties?.Status?.status?.name || "";
        if (bySubject[subj]) {
          bySubject[subj].total++;
          if (s === "Done" || s === "Revised") bySubject[subj].done++;
        }
      } catch(e) {}
    });

    // ── Daily blocks ──
    const todayRow = (daily.results || [])[0];
    const blockNames = [
      "Maths Block","Physics Block","Chem Block",
      "Run Done","Workout Done","Finance Block","Night Revision"
    ];
    let blocksDone = 0;
    if (todayRow) {
      blockNames.forEach(name => {
        try {
          if (todayRow.properties?.[name]?.checkbox) blocksDone++;
        } catch(e) {}
      });
    }

    // ── Punishments ──
    const punishRows = punishments.results || [];
    const pendingPunishments = punishRows.filter(r => {
      try { return !r.properties?.Served?.checkbox; }
      catch(e) { return false; }
    }).length;

    // ── Milestones ──
    const msRows = milestones.results || [];
    const doneMilestones = msRows.filter(r => {
      try { return r.properties?.Conquered?.checkbox; }
      catch(e) { return false; }
    }).length;

    // ── Day number ──
    const startDate = new Date("2026-08-27");
    const dayNum = Math.max(1,
      Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        day: dayNum,
        chapters: {
          done: doneChapters,
          total: chRows.length || 51,
          bySubject,
        },
        blocks: { done: blocksDone, total: 7 },
        punishments: { pending: pendingPunishments },
        milestones: {
          done: doneMilestones,
          total: msRows.length || 17,
        },
      }),
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
