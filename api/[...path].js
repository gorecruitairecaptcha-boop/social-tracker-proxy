import { cors } from "../lib/cors.js";
import { query, getPool, liFetch, getTokenOrDB, escapeLittleText, PROXY_VERSION } from "../lib/db.js";

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } }
};

export default async function handler(req, res) {
  let segments = req.query.path || [];
  // Fallback: parse path from URL if query.path is empty
  if (segments.length === 0) {
    const urlPath = (req.url || "").replace(/^\/api\//, "").split("?")[0];
    if (urlPath) segments = urlPath.split("/").filter(Boolean);
  }
  const route = segments.join("/");

  // Share page and image routes serve HTML/binary — skip CORS
  if (!route.startsWith("s/") && !route.startsWith("img/")) {
    if (cors(req, res)) return;
  }

  try {
    // ---- Health ----
    if (route === "health") {
      try { await query("SELECT 1"); res.json({ status: "ok", db: "connected", version: PROXY_VERSION }); }
      catch (e) { res.json({ status: "ok", db: "error", error: e.message, version: PROXY_VERSION }); }
      return;
    }

    // ---- Login ----
    if (route === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { email, password } = req.body;
      const { rows } = await query("SELECT id,name,email,role,region FROM users WHERE email=$1 AND password=$2 AND is_active=true", [email, password]);
      if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
      return res.json({ user: rows[0] });
    }

    // ---- Users ----
    if (route === "users") {
      if (req.method === "GET") { const { rows } = await query("SELECT id,name,email,password,role,region,is_active FROM users ORDER BY role,name"); return res.json(rows); }
      if (req.method === "POST") { const { name, email, password, role, region } = req.body; const { rows } = await query("INSERT INTO users (name,email,password,role,region) VALUES ($1,$2,$3,$4,$5) RETURNING *", [name, email, password, role||"member", region||"India"]); return res.json(rows[0]); }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0] === "users" && segments[1]) {
      const id = segments[1];
      if (req.method === "PUT") { const { name, email, password, role } = req.body; await query("UPDATE users SET name=$1,email=$2,password=$3,role=$4 WHERE id=$5", [name, email, password, role, id]); return res.json({ success: true }); }
      if (req.method === "DELETE") { await query("UPDATE users SET is_active=false WHERE id=$1", [id]); return res.json({ success: true }); }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Tasks ----
    if (route === "tasks") {
      if (req.method === "GET") { const { rows } = await query("SELECT * FROM tasks ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC NULLS LAST"); return res.json(rows); }
      if (req.method === "POST") { const { title,description,category,region,page,priority,target_value,due_date,recurring,recurrence,status,assigned_to,assigned_by } = req.body; const { rows } = await query("INSERT INTO tasks (title,description,category,region,page,priority,target_value,due_date,recurring,recurrence,status,assigned_to,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [title,description,category,region,page,priority,target_value,due_date||null,recurring,recurrence,status||"pending",assigned_to,assigned_by]); return res.json(rows[0]); }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0] === "tasks" && segments[1]) {
      const id = segments[1];
      if (req.method === "PUT") { const { status } = req.body; await query("UPDATE tasks SET status=$1 WHERE id=$2", [status, id]); return res.json({ success: true }); }
      if (req.method === "DELETE") { await query("DELETE FROM tasks WHERE id=$1", [id]); return res.json({ success: true }); }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Task Completions ----
    if (route === "task-completions") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { task_id,user_id,completion_date,status,value,notes,link } = req.body;
      await query(`INSERT INTO task_completions (task_id,user_id,completion_date,status,value,notes,link) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (task_id,user_id,completion_date) DO UPDATE SET status=$4,value=$5,notes=$6,link=$7,updated_at=NOW()`, [task_id,user_id,completion_date,status,value||0,notes,link]);
      return res.json({ success: true });
    }

    // ---- Posts ----
    if (route === "posts") {
      if (req.method === "GET") { const { rows } = await query("SELECT * FROM posts ORDER BY post_date DESC"); return res.json(rows); }
      if (req.method === "POST") { const { post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by } = req.body; const { rows } = await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *", [post_date,page,content_type,title,notes,full_text,hashtags,likes||0,comments||0,shares||0,impressions||0,post_link,linkedin_urn,added_by]); return res.json(rows[0]); }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0] === "posts" && segments[1]) {
      const id = segments[1];
      if (req.method === "PUT") {
        const { post_link,linkedin_urn,full_text,image_url } = req.body;
        const sets=[],vals=[];let idx=1;
        if(post_link!==undefined){sets.push(`post_link=$${idx++}`);vals.push(post_link);}
        if(linkedin_urn!==undefined){sets.push(`linkedin_urn=$${idx++}`);vals.push(linkedin_urn);}
        if(full_text!==undefined){sets.push(`full_text=$${idx++}`);vals.push(full_text);}
        if(image_url!==undefined){sets.push(`image_url=$${idx++}`);vals.push(image_url);}
        if(sets.length===0)return res.json({success:true});
        vals.push(id);
        await query(`UPDATE posts SET ${sets.join(",")} WHERE id=$${idx}`,vals);
        return res.json({ success: true });
      }
      if (req.method === "DELETE") { await query("DELETE FROM posts WHERE id=$1", [id]); return res.json({ success: true }); }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Metrics ----
    if (route === "metrics") {
      if (req.method === "GET") {
        const { page } = req.query;
        const q = page ? "SELECT * FROM page_metrics WHERE page=$1 ORDER BY metric_date DESC" : "SELECT * FROM page_metrics ORDER BY metric_date DESC";
        const { rows } = page ? await query(q,[page]) : await query(q);
        return res.json(rows);
      }
      if (req.method === "POST") {
        const { metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,source } = req.body;
        const rate = impressions>0?((engagements/impressions)*100).toFixed(2):0;
        const { rows } = await query("INSERT INTO page_metrics (metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,engagement_rate,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
          [metric_date,page,followers||0,new_followers||0,impressions||0,engagements||0,profile_views||0,post_reach||0,page_views||0,unique_visitors||0,clicks||0,rate,source||"manual"]);
        return res.json(rows[0]);
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Employees ----
    if (route === "employees") {
      if (req.method === "GET") { const { rows } = await query("SELECT * FROM employees ORDER BY name"); return res.json(rows); }
      if (req.method === "POST") { const { name,title,team,region,linkedin_url,photo_url } = req.body; const { rows } = await query("INSERT INTO employees (name,title,team,region,linkedin_url,photo_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",[name,title,team,region,linkedin_url,photo_url]); return res.json(rows[0]); }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0] === "employees" && segments[1]) {
      const id = segments[1];
      if (req.method === "PUT") { const { name,title,team,region,linkedin_url,photo_url } = req.body; await query("UPDATE employees SET name=$1,title=$2,team=$3,region=$4,linkedin_url=$5,photo_url=$6 WHERE id=$7",[name,title,team,region,linkedin_url,photo_url,id]); return res.json({ success: true }); }
      if (req.method === "DELETE") { await query("DELETE FROM employees WHERE id=$1",[id]); return res.json({ success: true }); }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Engagement ----
    if (route === "engagement") {
      if (req.method === "GET") { const { rows } = await query("SELECT * FROM engagement ORDER BY date DESC"); return res.json(rows); }
      if (req.method === "POST") { const { post_id,employee_id,type,date,note } = req.body; const { rows } = await query("INSERT INTO engagement (post_id,employee_id,type,date,note) VALUES ($1,$2,$3,$4,$5) RETURNING *",[post_id,employee_id,type,date,note]); return res.json(rows[0]); }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0] === "engagement" && segments[1]) {
      const id = segments[1];
      if (req.method === "DELETE") { await query("DELETE FROM engagement WHERE id=$1",[id]); return res.json({ success: true }); }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- LinkedIn Settings ----
    if (route === "linkedin-settings") {
      if (req.method === "GET") {
        const { rows } = await query("SELECT config_key,config_value FROM api_config WHERE config_key IN ('linkedin_access_token','proxy_url','techwaukee_org_id','gorecruitai_org_id','linkedin_client_id')");
        const cfg={}; rows.forEach(r=>{cfg[r.config_key]=r.config_value;}); if(cfg.linkedin_access_token)cfg.has_token=true;
        return res.json(cfg);
      }
      if (req.method === "POST") {
        const entries = Object.entries(req.body);
        for(const [key,value] of entries){ await query(`INSERT INTO api_config (config_key,config_value) VALUES ($1,$2) ON CONFLICT (config_key) DO UPDATE SET config_value=$2,updated_at=NOW()`,[key,value||""]); }
        return res.json({ success: true });
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- LinkedIn Org Dashboard ----
    if (segments[0]==="linkedin" && segments[1]==="org" && segments[2] && segments[3]==="dashboard") {
      const token = await getTokenOrDB(req);
      if(!token) return res.status(401).json({error:"LinkedIn token not configured. Ask admin to set it in Settings."});
      const orgId = segments[2];
      const pageName=orgId==="15078287"?"techwaukee":"gorecruitai";

      // Helper: liFetch with 7s timeout to stay within Vercel's 10s limit
      const liFetchT = (url) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        return liFetch(url, token, { signal: ctrl.signal }).then(r => { clearTimeout(timer); return r; }).catch(() => { clearTimeout(timer); return { error: true, data: {} }; });
      };

      const LI="https://api.linkedin.com/v2";
      const urn=encodeURIComponent(`urn:li:organization:${orgId}`);
      let totalFollowers=0, impressions=0, clicks=0, likes=0, comments=0, shares=0, pageViews=0, uniqueVisitors=0;
      let liveOk = false;

      try {
        const [networkSize,shareStats,pageStats] = await Promise.all([
          liFetchT(`${LI}/networkSizes/${urn}?edgeType=CompanyFollowedByMember`),
          liFetchT(`${LI}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${urn}`),
          liFetchT(`${LI}/organizationPageStatistics?q=organization&organization=${urn}`),
        ]);
        totalFollowers=networkSize.data?.firstDegreeSize||0;
        const sStats=(shareStats.data?.elements||[])[0]?.totalShareStatistics||{};
        impressions=sStats.impressionCount||0; clicks=sStats.clickCount||0;
        likes=sStats.likeCount||0; comments=sStats.commentCount||0; shares=sStats.shareCount||0;
        (pageStats.data?.elements||[]).forEach(el=>{if(el.totalPageStatistics){pageViews=el.totalPageStatistics.views?.allPageViews?.pageViews||0;uniqueVisitors=el.totalPageStatistics.views?.allPageViews?.uniquePageViews||0;}});
        if(totalFollowers>0) liveOk=true;
      } catch(e) { /* fall through to DB */ }

      // If live API failed/timed out, return latest from DB
      if(!liveOk) {
        try {
          const { rows } = await query("SELECT * FROM page_metrics WHERE page=$1 ORDER BY metric_date DESC LIMIT 1",[pageName]);
          if(rows.length) {
            const m=rows[0];
            return res.json({orgId,timestamp:m.metric_date,totalFollowers:m.followers||0,newFollowers:m.new_followers||0,postImpressions:m.impressions||0,pageVisitors:m.unique_visitors||0,impressions:m.impressions||0,clicks:m.clicks||0,likes:0,comments:0,shares:0,engagement:0,pageViews:m.page_views||0,uniqueVisitors:m.unique_visitors||0,source:"database"});
          }
        } catch(e) {}
        // No DB data either — return zeros
        return res.json({orgId,timestamp:new Date().toISOString(),totalFollowers:0,newFollowers:0,postImpressions:0,pageVisitors:0,impressions:0,clicks:0,likes:0,comments:0,shares:0,engagement:0,pageViews:0,uniqueVisitors:0,source:"none"});
      }

      const result={orgId,timestamp:new Date().toISOString(),totalFollowers,newFollowers:0,postImpressions:impressions,pageVisitors:uniqueVisitors,impressions,clicks,likes,comments,shares,engagement:0,pageViews,uniqueVisitors,source:"linkedin"};
      try{await query("INSERT INTO page_metrics (metric_date,page,followers,impressions,engagements,page_views,unique_visitors,clicks,source) VALUES (CURRENT_DATE,$1,$2,$3,$4,$5,$6,$7,'api') ON CONFLICT DO NOTHING",[pageName,totalFollowers,impressions,likes+comments+shares,pageViews,uniqueVisitors,clicks]);}catch{}
      return res.json(result);
    }

    // ---- LinkedIn Post (text) ----
    if (route === "linkedin/post") {
      if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
      const token=await getTokenOrDB(req);
      if(!token)return res.status(401).json({error:"LinkedIn token not configured. Ask admin to set it in Settings."});
      const{orgId,text}=req.body;
      if(!orgId||!text)return res.status(400).json({error:"Missing orgId or text"});
      const postBody={author:`urn:li:organization:${orgId}`,commentary:escapeLittleText(text),visibility:"PUBLIC",distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false};
      const result=await liFetch("https://api.linkedin.com/rest/posts",token,{method:"POST",body:postBody});
      if(result.error)return res.status(result.status).json({success:false,error:result.data?.message||"Failed",data:result.data});
      const liUrn=result.postUrn||null;const liLink=liUrn?`https://www.linkedin.com/feed/update/${liUrn}`:"";
      const pageName=orgId==="15078287"?"techwaukee":"gorecruitai";
      try{await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Published via API',$4,$5,$6,'api')",[pageName,"Text Post",text.slice(0,300),text,liLink,liUrn]);}catch{}
      return res.json({success:true,data:result.data,linkedinUrl:liLink,linkedinUrn:liUrn,textLength:text.length});
    }

    // ---- LinkedIn Post with Image ----
    if (route === "linkedin/post-with-image") {
      if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
      const token=await getTokenOrDB(req);
      if(!token)return res.status(401).json({error:"Missing Bearer token"});
      const{orgId,text,imageUrn,url}=req.body;
      if(!orgId||!text)return res.status(400).json({error:"orgId and text required"});
      const postBody={author:`urn:li:organization:${orgId}`,commentary:escapeLittleText(text),visibility:"PUBLIC",distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false};
      if(imageUrn){postBody.content={media:{id:imageUrn}};if(url?.trim())postBody.content.media.altText=`Click to visit: ${url}`;}
      const result=await liFetch("https://api.linkedin.com/rest/posts",token,{method:"POST",body:postBody});
      if(result.error)return res.status(result.status).json({success:false,error:result.data?.message||"Failed",data:result.data});
      const liUrn=result.postUrn||null;const liLink=liUrn?`https://www.linkedin.com/feed/update/${liUrn}`:"";
      const pageName=orgId==="15078287"?"techwaukee":"gorecruitai";
      try{await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Published via API',$4,$5,$6,'api')",[pageName,imageUrn?"Image Post":"Text Post",text.slice(0,300),text,liLink,liUrn]);}catch{}
      return res.json({success:true,data:result.data,linkedinUrl:liLink,linkedinUrn:liUrn,textLength:text.length});
    }

    // ---- LinkedIn Upload Image ----
    if (route === "linkedin/upload-image") {
      if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
      const token=await getTokenOrDB(req);
      if(!token)return res.status(401).json({error:"Missing Bearer token"});
      const{orgId,imageBase64,mimeType}=req.body;
      if(!orgId||!imageBase64)return res.status(400).json({error:"orgId and imageBase64 required"});
      const regResult=await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload",token,{method:"POST",body:{initializeUploadRequest:{owner:`urn:li:organization:${orgId}`}}});
      if(regResult.error)return res.status(regResult.status).json({error:"Failed to register image upload",data:regResult.data});
      const uploadUrl=regResult.data?.value?.uploadUrl;const imageUrn=regResult.data?.value?.image;
      if(!uploadUrl||!imageUrn)return res.status(500).json({error:"No upload URL returned from LinkedIn"});
      const imageBuffer=Buffer.from(imageBase64,"base64");
      const uploadRes=await fetch(uploadUrl,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType||"image/png"},body:imageBuffer});
      if(!uploadRes.ok)return res.status(uploadRes.status).json({error:`Image upload failed: ${uploadRes.status}`});
      return res.json({success:true,imageUrn});
    }

    // ---- LinkedIn Post Stats ----
    if (segments[0]==="linkedin" && segments[1]==="post-stats" && segments[2]) {
      const token=await getTokenOrDB(req);
      if(!token)return res.status(401).json({error:"Token not configured"});
      const urnParam=segments[2];const decoded=decodeURIComponent(urnParam);
      let result=await liFetch(`https://api.linkedin.com/rest/socialMetadata/${encodeURIComponent(decoded)}`,token);
      if(result.error){result=await liFetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(decoded)}`,token);}
      if(result.error)return res.status(result.status).json({error:result.data?.message||"Failed to fetch stats",data:result.data});
      const d=result.data;
      const stats={likeCount:d.likesSummary?.totalLikes??d.likes?.length??d.numLikes??0,commentCount:d.commentsSummary?.aggregatedTotalComments??d.comments?.length??d.numComments??0,shareCount:d.sharesSummary?.totalShares??d.numShares??0};
      try{await query("UPDATE posts SET likes=$1,comments=$2,shares=$3,last_synced_at=NOW() WHERE linkedin_urn=$4",[stats.likeCount,stats.commentCount,stats.shareCount,decoded]);}catch{}
      return res.json(stats);
    }

    // ---- Scheduled Posts ----
    if (route === "scheduled-posts") {
      if (req.method === "GET") { const { rows } = await query("SELECT id,text,page,url,scheduled_at,org_id,status,error,published_at,created_at FROM scheduled_posts ORDER BY scheduled_at ASC"); return res.json(rows); }
      if (req.method === "POST") {
        const{text,page,url,image_url,scheduled_at,org_id,access_token}=req.body;
        if(!text||!scheduled_at||!org_id)return res.status(400).json({error:"text, scheduled_at, and org_id required"});
        const{rows}=await query("INSERT INTO scheduled_posts (text,page,url,image_url,scheduled_at,org_id,access_token,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *",[text,page,url,image_url,scheduled_at,org_id,access_token]);
        return res.json(rows[0]);
      }
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (segments[0]==="scheduled-posts" && segments[1]) {
      const id=segments[1];
      if(req.method==="DELETE"){await query("DELETE FROM scheduled_posts WHERE id=$1",[id]);return res.json({success:true});}
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Share Page Creation ----
    if (route === "share") {
      if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
      const{title,description,destination_url,image_base64}=req.body;
      if(!destination_url)return res.status(400).json({error:"destination_url required"});
      const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      let imgUrl="";
      if(image_base64){
        const clean=image_base64.includes(",")?image_base64.split(",")[1]:image_base64;
        const IMGBB_KEY=process.env.IMGBB_KEY||"";
        if(IMGBB_KEY){try{const form=new URLSearchParams();form.append("key",IMGBB_KEY);form.append("image",clean);const r=await fetch("https://api.imgbb.com/1/upload",{method:"POST",body:form});const d=await r.json();if(d.success)imgUrl=d.data.url;}catch{}}
      }
      await query("INSERT INTO share_pages (id,title,description,destination_url,image_url,image_data) VALUES ($1,$2,$3,$4,$5,$6)",[id,title||"",description||"",destination_url,imgUrl||null,(!imgUrl&&image_base64)?image_base64:null]);
      const baseUrl=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:"");
      return res.json({success:true,shareUrl:`${baseUrl}/api/s/${id}`,imageUrl:imgUrl,id});
    }

    // ---- Share Page Serve (OG meta) ----
    if (segments[0]==="s" && segments[1]) {
      const id=segments[1];
      const{rows}=await query("SELECT * FROM share_pages WHERE id=$1",[id]);
      if(rows.length===0)return res.status(404).send("Not found");
      const p=rows[0];
      const baseUrl=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:"");
      const imgUrl=p.image_url||(p.image_data?`${baseUrl}/api/img/${p.id}`:"");
      const safeTitle=(p.title||"Techwaukee").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      const safeDesc=(p.description||"").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      res.setHeader("Content-Type","text/html");
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta property="og:type" content="website"/><meta property="og:title" content="${safeTitle}"/><meta property="og:description" content="${safeDesc}"/>${imgUrl?`<meta property="og:image" content="${imgUrl}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="627"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:image" content="${imgUrl}"/>`:""}<meta property="og:url" content="${baseUrl}/api/s/${p.id}"/><title>${safeTitle}</title></head><body><script>window.location.href="${p.destination_url.replace(/"/g,'\\"')}";</script><p>Redirecting to <a href="${p.destination_url}">${safeTitle}</a>...</p></body></html>`);
    }

    // ---- Image Serve ----
    if (segments[0]==="img" && segments[1]) {
      const id=segments[1];
      const{rows}=await query("SELECT image_data FROM share_pages WHERE id=$1",[id]);
      if(rows.length===0||!rows[0].image_data)return res.status(404).send("Not found");
      const raw=rows[0].image_data;const base64=raw.includes(",")?raw.split(",")[1]:raw;
      res.setHeader("Content-Type","image/png");res.setHeader("Cache-Control","public, max-age=31536000");
      return res.send(Buffer.from(base64,"base64"));
    }

    // ---- Cron: Check Scheduled Posts ----
    if (route === "cron/check-scheduled") {
      if(req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`&&process.env.CRON_SECRET)return res.status(401).json({error:"Unauthorized"});
      const{rows}=await query("SELECT * FROM scheduled_posts WHERE status='pending' AND scheduled_at <= (NOW() AT TIME ZONE 'Asia/Kolkata')");
      if(rows.length===0)return res.json({processed:0});
      let sharedToken=null;
      try{const tokenRes=await query("SELECT config_value FROM api_config WHERE config_key='linkedin_access_token'");sharedToken=tokenRes.rows[0]?.config_value||null;}catch{}
      let published=0,failed=0;
      for(const post of rows){
        try{
          const token=post.access_token||sharedToken;
          if(!token){await query("UPDATE scheduled_posts SET status='failed',error='No access token configured.' WHERE id=$1",[post.id]);failed++;continue;}
          let uploadedImageUrn=null;
          if(post.image_url&&post.image_url.startsWith("data:")){
            try{const base64=post.image_url.split(",")[1]||post.image_url;const mimeMatch=post.image_url.match(/data:([^;]+);/);const mimeType=mimeMatch?mimeMatch[1]:"image/png";
            const regResult=await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload",token,{method:"POST",body:{initializeUploadRequest:{owner:`urn:li:organization:${post.org_id}`}}});
            if(!regResult.error&&regResult.data?.value?.uploadUrl){uploadedImageUrn=regResult.data.value.image;await fetch(regResult.data.value.uploadUrl,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType},body:Buffer.from(base64,"base64")});}}catch{}
          }
          const postBody={author:`urn:li:organization:${post.org_id}`,commentary:escapeLittleText(post.text),visibility:"PUBLIC",distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false};
          if(uploadedImageUrn){postBody.content={media:{id:uploadedImageUrn}};if(post.url?.trim())postBody.content.media.altText=`Click to visit: ${post.url}`;}
          const result=await liFetch("https://api.linkedin.com/rest/posts",token,{method:"POST",body:postBody});
          if(result.error){await query("UPDATE scheduled_posts SET status='failed',error=$1 WHERE id=$2",[result.data?.message||`HTTP ${result.status}`,post.id]);failed++;}
          else{const liUrn=result.postUrn||null;const liLink=liUrn?`https://www.linkedin.com/feed/update/${liUrn}`:"";
          await query("UPDATE scheduled_posts SET status='published',published_at=NOW() WHERE id=$1",[post.id]);
          const contentType=uploadedImageUrn?"Image Post":"Scheduled Post";
          await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Auto-published by scheduler',$4,$5,$6,'scheduler')",[post.page||"techwaukee",contentType,post.text.slice(0,300),post.text,liLink,liUrn]);published++;}
        }catch(e){await query("UPDATE scheduled_posts SET status='failed',error=$1 WHERE id=$2",[e.message,post.id]);failed++;}
      }
      return res.json({processed:rows.length,published,failed});
    }

    // ---- Init DB ----
    if (route === "init-db") {
      if(req.method!=="POST")return res.status(405).json({error:"POST only"});
      const client=await getPool().connect();
      try{
        await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,email VARCHAR(150) UNIQUE NOT NULL,password VARCHAR(255) NOT NULL,role VARCHAR(20) DEFAULT 'member',region VARCHAR(20) DEFAULT 'India',is_active BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY,title VARCHAR(300) NOT NULL,description TEXT,category VARCHAR(50),region VARCHAR(20) DEFAULT 'all',page VARCHAR(20) DEFAULT 'both',priority VARCHAR(10) DEFAULT 'medium',target_value INT DEFAULT 1,due_date DATE,recurring BOOLEAN DEFAULT false,recurrence VARCHAR(20) DEFAULT 'daily',status VARCHAR(20) DEFAULT 'pending',assigned_to VARCHAR(50),assigned_by VARCHAR(50),created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS task_completions (id SERIAL PRIMARY KEY,task_id INT REFERENCES tasks(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,completion_date DATE NOT NULL,status VARCHAR(20) DEFAULT 'pending',value INT DEFAULT 0,notes TEXT,link VARCHAR(500),updated_at TIMESTAMP DEFAULT NOW(),UNIQUE(task_id,user_id,completion_date));
CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY,post_date DATE NOT NULL,page VARCHAR(20) NOT NULL,content_type VARCHAR(50),title VARCHAR(300),notes TEXT,full_text TEXT,hashtags VARCHAR(500),likes INT DEFAULT 0,comments INT DEFAULT 0,shares INT DEFAULT 0,impressions INT DEFAULT 0,post_link VARCHAR(500),linkedin_urn VARCHAR(300),added_by VARCHAR(50),last_synced_at TIMESTAMP,image_url TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS page_metrics (id SERIAL PRIMARY KEY,metric_date DATE NOT NULL,page VARCHAR(20) NOT NULL,followers INT DEFAULT 0,new_followers INT DEFAULT 0,impressions INT DEFAULT 0,engagements INT DEFAULT 0,profile_views INT DEFAULT 0,post_reach INT DEFAULT 0,page_views INT DEFAULT 0,unique_visitors INT DEFAULT 0,clicks INT DEFAULT 0,engagement_rate DECIMAL(5,2) DEFAULT 0,source VARCHAR(20) DEFAULT 'manual',created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,title VARCHAR(100),team VARCHAR(50),region VARCHAR(20) DEFAULT 'India',linkedin_url VARCHAR(300),photo_url VARCHAR(300),created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS engagement (id SERIAL PRIMARY KEY,post_id VARCHAR(50) NOT NULL,employee_id VARCHAR(50) NOT NULL,type VARCHAR(20) NOT NULL,date DATE NOT NULL,note TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS api_config (id SERIAL PRIMARY KEY,config_key VARCHAR(50) UNIQUE NOT NULL,config_value TEXT,updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS share_pages (id VARCHAR(20) PRIMARY KEY,title VARCHAR(300),description VARCHAR(500),destination_url VARCHAR(500) NOT NULL,image_url VARCHAR(500),image_data TEXT,created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS scheduled_posts (id SERIAL PRIMARY KEY,text TEXT NOT NULL,page VARCHAR(20),url VARCHAR(500),image_url TEXT,scheduled_at TIMESTAMP NOT NULL,org_id VARCHAR(50) NOT NULL,access_token TEXT,status VARCHAR(20) DEFAULT 'pending',error TEXT,published_at TIMESTAMP,created_at TIMESTAMP DEFAULT NOW());`);
        const{rows}=await client.query("SELECT COUNT(*) as c FROM users");
        if(parseInt(rows[0].c)===0){
          await client.query(`INSERT INTO users (name,email,password,role,region) VALUES ('Admin','admin@techwaukee.com','admin123','admin','all'),('Sneha Reddy','sneha@techwaukee.com','manager123','manager','India'),('Priya Sharma','priya@techwaukee.com','member123','member','India')`);
          await client.query(`INSERT INTO employees (name,title,team,region,linkedin_url) VALUES ('Pavithra M','Team Lead','Recruitment','India','https://linkedin.com/in/pavithra-m'),('Sandhya S','Team Lead','Recruitment','India','https://linkedin.com/in/sandhya-s'),('Vaishnavi A','Recruiter','US Staffing','India','https://linkedin.com/in/vaishnavi-a'),('Asfiya','Recruiter','US Staffing','India','https://linkedin.com/in/asfiya'),('Abinaya J','Recruiter','India','India','https://linkedin.com/in/abinaya-j'),('John','Recruiter','US Staffing','USA','https://linkedin.com/in/john'),('Rajesh Kumar','Senior Recruiter','India','India','https://linkedin.com/in/rajesh-kumar'),('Mike Chen','Senior Recruiter','US Staffing','USA','https://linkedin.com/in/mike-chen')`);
          await client.query(`INSERT INTO api_config (config_key,config_value) VALUES ('techwaukee_org_id','15078287'),('linkedin_client_id','86rz73bd1rfacx'),('linkedin_access_token','') ON CONFLICT DO NOTHING`);
        }
        res.json({success:true,message:"Database initialized"});
      }catch(e){res.status(500).json({error:e.message});}finally{client.release();}
      return;
    }

    // ---- Import Data ----
    if (route === "import-data") {
      if(req.method!=="POST")return res.status(405).json({error:"POST only"});
      const data=req.body;const results={};
      if(data.users?.length){for(const u of data.users){try{await query("INSERT INTO users (id,name,email,password,role,region,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",[u.id,u.name,u.email,u.password,u.role,u.region,u.is_active,u.created_at]);}catch{}}await query("SELECT setval('users_id_seq',(SELECT COALESCE(MAX(id),0) FROM users))");results.users=data.users.length;}
      if(data.employees?.length){for(const e of data.employees){try{await query("INSERT INTO employees (id,name,title,team,region,linkedin_url,photo_url,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",[e.id,e.name,e.title,e.team,e.region,e.linkedin_url,e.photo_url,e.created_at]);}catch{}}await query("SELECT setval('employees_id_seq',(SELECT COALESCE(MAX(id),0) FROM employees))");results.employees=data.employees.length;}
      if(data.posts?.length){for(const p of data.posts){try{await query("INSERT INTO posts (id,post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by,last_synced_at,image_url,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO NOTHING",[p.id,p.post_date,p.page,p.content_type,p.title,p.notes,p.full_text,p.hashtags,p.likes,p.comments,p.shares,p.impressions,p.post_link,p.linkedin_urn,p.added_by,p.last_synced_at,p.image_url,p.created_at]);}catch{}}await query("SELECT setval('posts_id_seq',(SELECT COALESCE(MAX(id),0) FROM posts))");results.posts=data.posts.length;}
      if(data.metrics?.length){for(const m of data.metrics){try{await query("INSERT INTO page_metrics (id,metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,engagement_rate,source,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING",[m.id,m.metric_date,m.page,m.followers,m.new_followers,m.impressions,m.engagements,m.profile_views,m.post_reach,m.page_views,m.unique_visitors,m.clicks,m.engagement_rate,m.source,m.created_at]);}catch{}}await query("SELECT setval('page_metrics_id_seq',(SELECT COALESCE(MAX(id),0) FROM page_metrics))");results.metrics=data.metrics.length;}
      if(data.api_config?.length){for(const c of data.api_config){try{await query("INSERT INTO api_config (config_key,config_value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (config_key) DO UPDATE SET config_value=$2,updated_at=$3",[c.config_key,c.config_value,c.updated_at]);}catch{}}results.api_config=data.api_config.length;}
      if(data.scheduled_posts?.length){for(const s of data.scheduled_posts){try{await query("INSERT INTO scheduled_posts (id,text,page,url,scheduled_at,org_id,status,error,published_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING",[s.id,s.text,s.page,s.url,s.scheduled_at,s.org_id,s.status,s.error,s.published_at,s.created_at]);}catch{}}await query("SELECT setval('scheduled_posts_id_seq',(SELECT COALESCE(MAX(id),0) FROM scheduled_posts))");results.scheduled_posts=data.scheduled_posts.length;}
      return res.json({success:true,imported:results});
    }

    // ---- AI Generate ----
    if (route === "ai/generate") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { topic, tone, type, brandVoice } = req.body;
      if (!topic) return res.status(400).json({ error: "topic is required" });
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
      if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured" });
      const systemPrompt = `You are a LinkedIn content expert. Write a compelling LinkedIn post about the given topic. Include relevant emojis, hashtags, and maintain a professional tone. The post should be engaging, encourage interaction, and be optimized for LinkedIn's algorithm. Keep it concise but impactful.${brandVoice ? `\n\nBrand voice guidelines: ${brandVoice}` : ""}`;
      const userPrompt = `Write a LinkedIn post about: ${topic}${tone ? `\nTone: ${tone}` : ""}${type ? `\nPost type: ${type}` : ""}`;
      try {
        const aiRes = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.7 }) });
        const aiData = await aiRes.json();
        if (!aiRes.ok) return res.status(aiRes.status).json({ error: "DeepSeek API error", details: aiData });
        return res.json({ success: true, text: aiData.choices?.[0]?.message?.content || "", usage: aiData.usage });
      } catch (e) { return res.status(500).json({ error: "AI generation failed", message: e.message }); }
    }

    // ---- AI Best Time ----
    if (route === "ai/best-time") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { orgId } = req.body;
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
      if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured" });
      try {
        const { rows } = await query("SELECT post_date, likes, comments, shares, impressions FROM posts WHERE (likes+comments+shares) > 0 ORDER BY post_date DESC LIMIT 100");
        if (rows.length < 5) return res.json({ success: true, source: "heuristic", recommendations: [{ day: "Tuesday", time: "09:00", reason: "Generally high engagement for B2B" }, { day: "Wednesday", time: "10:00", reason: "Mid-week peak activity" }, { day: "Thursday", time: "08:30", reason: "Strong morning engagement" }] });
        const postData = rows.map(r => ({ date: r.post_date, day: new Date(r.post_date).toLocaleDateString("en-US", { weekday: "long" }), engagement: (r.likes || 0) + (r.comments || 0) + (r.shares || 0), impressions: r.impressions || 0 }));
        const aiRes = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "You are a LinkedIn analytics expert. Analyze posting patterns and engagement data to recommend the best times to post. Return a JSON object with a 'recommendations' array, each item having 'day', 'time' (HH:MM format), and 'reason' fields. Return ONLY valid JSON, no markdown." }, { role: "user", content: `Analyze this posting data and recommend the top 3 best times to post on LinkedIn:\n${JSON.stringify(postData)}${orgId ? `\nOrg ID: ${orgId}` : ""}` }], temperature: 0.5 }) });
        const aiData = await aiRes.json();
        if (!aiRes.ok) return res.status(aiRes.status).json({ error: "DeepSeek API error", details: aiData });
        const content = aiData.choices?.[0]?.message?.content || "{}";
        try { const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); return res.json({ success: true, source: "ai", postsAnalyzed: rows.length, ...parsed }); } catch { return res.json({ success: true, source: "ai", raw: content, postsAnalyzed: rows.length }); }
      } catch (e) { return res.status(500).json({ error: "Best time analysis failed", message: e.message }); }
    }

    // ---- AI Sentiment ----
    if (route === "ai/sentiment") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { postIds } = req.body;
      if (!postIds || !Array.isArray(postIds) || postIds.length === 0) return res.status(400).json({ error: "postIds array is required" });
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
      if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured" });
      try {
        const placeholders = postIds.map((_, i) => `$${i + 1}`).join(",");
        const { rows } = await query(`SELECT id, title, full_text, likes, comments, shares, impressions FROM posts WHERE id IN (${placeholders})`, postIds);
        if (rows.length === 0) return res.status(404).json({ error: "No posts found for the given IDs" });
        const postData = rows.map(r => ({ id: r.id, text: (r.full_text || r.title || "").slice(0, 500), likes: r.likes || 0, comments: r.comments || 0, shares: r.shares || 0, impressions: r.impressions || 0 }));
        const aiRes = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "You are a social media analyst. Analyze the sentiment and performance of LinkedIn posts. For each post, provide sentiment (positive/neutral/negative), a score (0-100), and a brief insight. Also provide an overall summary. Return ONLY valid JSON with 'posts' array (each with 'id', 'sentiment', 'score', 'insight') and 'summary' string. No markdown." }, { role: "user", content: `Analyze sentiment and performance of these LinkedIn posts:\n${JSON.stringify(postData)}` }], temperature: 0.5 }) });
        const aiData = await aiRes.json();
        if (!aiRes.ok) return res.status(aiRes.status).json({ error: "DeepSeek API error", details: aiData });
        const content = aiData.choices?.[0]?.message?.content || "{}";
        try { const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); return res.json({ success: true, ...parsed }); } catch { return res.json({ success: true, raw: content }); }
      } catch (e) { return res.status(500).json({ error: "Sentiment analysis failed", message: e.message }); }
    }

    // ---- AI Reports Query ----
    if (route === "ai/reports-query") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { question } = req.body;
      if (!question) return res.status(400).json({ error: "question is required" });
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
      if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured" });
      try {
        const [postsRes, metricsRes, engagementRes] = await Promise.all([
          query("SELECT COUNT(*) as total_posts, SUM(likes) as total_likes, SUM(comments) as total_comments, SUM(shares) as total_shares, SUM(impressions) as total_impressions, AVG(likes) as avg_likes, AVG(comments) as avg_comments, AVG(shares) as avg_shares, AVG(impressions) as avg_impressions FROM posts"),
          query("SELECT COUNT(*) as total_entries, AVG(followers) as avg_followers, AVG(impressions) as avg_impressions, AVG(engagements) as avg_engagements, AVG(engagement_rate) as avg_engagement_rate, MAX(followers) as max_followers FROM page_metrics"),
          query("SELECT COUNT(*) as total_engagements, COUNT(DISTINCT employee_id) as active_employees, COUNT(DISTINCT post_id) as posts_engaged FROM engagement")
        ]);
        const summaryData = { posts: postsRes.rows[0], metrics: metricsRes.rows[0], engagement: engagementRes.rows[0] };
        const aiRes = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "You are a LinkedIn analytics assistant for a social media tracking tool. Answer questions about the company's LinkedIn performance based on the provided data. Be concise, data-driven, and actionable. If the data doesn't contain enough info to answer, say so." }, { role: "user", content: `Here is our LinkedIn performance data:\n${JSON.stringify(summaryData)}\n\nQuestion: ${question}` }], temperature: 0.5 }) });
        const aiData = await aiRes.json();
        if (!aiRes.ok) return res.status(aiRes.status).json({ error: "DeepSeek API error", details: aiData });
        return res.json({ success: true, answer: aiData.choices?.[0]?.message?.content || "", data: summaryData, usage: aiData.usage });
      } catch (e) { return res.status(500).json({ error: "Reports query failed", message: e.message }); }
    }

    // ---- AI Brand Voice ----
    if (route === "ai/brand-voice") {
      if (req.method === "GET") {
        try { const { rows } = await query("SELECT config_value FROM api_config WHERE config_key='brand_voice'"); return res.json({ success: true, brandVoice: rows[0]?.config_value || "" }); }
        catch (e) { return res.status(500).json({ error: e.message }); }
      }
      if (req.method === "POST") {
        const { brandVoice } = req.body;
        try { await query("INSERT INTO api_config (config_key,config_value) VALUES ('brand_voice',$1) ON CONFLICT (config_key) DO UPDATE SET config_value=$1,updated_at=NOW()", [brandVoice || ""]); return res.json({ success: true }); }
        catch (e) { return res.status(500).json({ error: e.message }); }
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Bulk Schedule ----
    if (route === "bulk-schedule") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { posts } = req.body;
      if (!posts || !Array.isArray(posts) || posts.length === 0) return res.status(400).json({ error: "posts array is required" });
      try {
        let count = 0;
        for (const p of posts) {
          if (!p.text || !p.scheduled_at || !p.org_id) continue;
          await query("INSERT INTO scheduled_posts (text,page,url,scheduled_at,org_id,status) VALUES ($1,$2,$3,$4,$5,'pending')", [p.text, p.page || null, p.url || null, p.scheduled_at, p.org_id]);
          count++;
        }
        return res.json({ success: true, scheduled: count });
      } catch (e) { return res.status(500).json({ error: "Bulk schedule failed", message: e.message }); }
    }

    // ---- 404 ----
    return res.status(404).json({ error: "Not found", path: route });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
