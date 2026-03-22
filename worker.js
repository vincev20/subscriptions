/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
//   async fetch(request, env, ctx) {
//     // You can view your logs in the Observability dashboard
//     console.info({ message: 'Hello World Worker received a request!' }); 
//     return new Response('Hello World!');
//   }
// };

// ============================================================
//  SUBSCRIPTION PORTAL — CLOUDFLARE WORKER
//  Environment variables to set in Cloudflare Dashboard:
//    HUBSPOT_TOKEN   — your HubSpot Private App token
//    ALLOWED_ORIGIN  — e.g. https://yourclientsite.com or
//                      https://yourclientsite.com,http://localhost:3000
//    PDF_FOLDER_ID   — numeric folder ID from HubSpot File Manager
//    HUBSPOT_PROFILE_IMAGE_PROPERTY — optional contact property internal name
//    PROFILE_IMAGE_FOLDER_PATH      — optional HubSpot folder path for profile images
// ============================================================

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin');
    const corsOrigin = getCorsOrigin(requestOrigin, env.ALLOWED_ORIGIN);

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(corsOrigin);
    }

    // ── Block any origin that isn't your DNN site ──
    const origin = requestOrigin || '';
    // if (origin !== env.ALLOWED_ORIGIN) {
    //   return new Response('Forbidden', { status: 403 });
    // }

    const url      = new URL(request.url);
    const path     = url.pathname;
    const corsHdrs = corsHeaders(corsOrigin);

    // ── Route requests ──
    try {
      if (path === '/api/subscriber' && request.method === 'GET') {
        return await getSubscriber(url, env, corsHdrs);
      }
      if (path === '/api/subscriber-update' && request.method === 'POST') {
        return await updateSubscriber(request, env, corsHdrs);
      }
      if (path === '/api/pdfs' && request.method === 'GET') {
        return await getPdfs(env, corsHdrs);
      }
      if (path === '/api/pdfs-by-folder' && request.method === 'GET') {
        return await getPdfsByFolder(url, env, corsHdrs);
      }
      if (path === '/api/pdf-url' && request.method === 'GET') {
        return await getPdfSignedUrl(url, env, corsHdrs);
      }
      if (path === '/api/pdf-download' && request.method === 'GET') {
        return await downloadPdf(url, env, corsHdrs);
      }
      if (path === '/api/profile-image' && request.method === 'POST') {
        return await uploadProfileImage(request, env, corsHdrs);
      }
      return new Response('Not Found', { status: 404, headers: corsHdrs });

    } catch (err) {
      console.error('Worker error:', err);
      return Response.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHdrs }
      );
    }
  }
};


// ============================================================
//  ROUTE 1: GET /api/subscriber
//  Query params: email, uid, fp (fingerprint)
//  Returns: profile + subscription fields from HubSpot
// ============================================================
async function getSubscriber(url, env, corsHdrs) {
  const email = url.searchParams.get('email');
  const uid   = url.searchParams.get('uid');
  const fp    = url.searchParams.get('fp');

  // Basic validation
  if (!email || !isValidEmail(email)) {
    return Response.json(
      { error: 'Valid email is required' },
      { status: 400, headers: corsHdrs }
    );
  }
  if (!uid || !fp) {
    return Response.json(
      { error: 'Missing required parameters' },
      { status: 400, headers: corsHdrs }
    );
  }

  // ── Validate fingerprint ──
  const isValid = await validateFingerprint(email, uid, fp, env);
  // if (!isValid) {
  //   return Response.json(
  //     { error: 'Forbidden' },
  //     { status: 403, headers: corsHdrs }
  //   );
  // }

  const hsHeaders = hubspotHeaders(env.HUBSPOT_TOKEN);
  const contactProperties = [
    'firstname',
    'lastname',
    'email',
    'phone',
    'lifo_status',
    'lifo_gpd_social_media_announcement_link',
    'profile_image_file_id'
  ];
  const profileImageProperty = sanitizePropertyName(env.HUBSPOT_PROFILE_IMAGE_PROPERTY || 'profile_image_path');
  if (profileImageProperty) {
    contactProperties.push(profileImageProperty);
  }

  // ── Fetch contact from HubSpot CRM ──
  const contactRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}` +
    `?idProperty=email&properties=${encodeURIComponent(contactProperties.join(','))}`,
    { headers: hsHeaders }
  );

  if (contactRes.status === 404) {
    return Response.json(
      { error: 'Subscriber not found' },
      { status: 404, headers: corsHdrs }
    );
  }
  if (!contactRes.ok) {
    return Response.json(
      { error: 'Failed to fetch subscriber' },
      { status: 502, headers: corsHdrs }
    );
  }

  const contact = await contactRes.json();
  const properties = contact.properties || {};
  const subscription = {
    type:        'LIFO® Certified Practitioner',
    status:      properties.lifo_status || '',
    startDate:   '',
    expiryDate:  '',
    accessLevel: '',
    nextRenewal: '',
    testing:     properties.lifo_gpd_social_media_announcement_link || ''
  };

  // ── Fetch subscription status ──
  const subRes = await fetch(
    `https://api.hubapi.com/communication-preferences/v3/status/email/${encodeURIComponent(email)}`,
    { headers: hsHeaders }
  );

  let isSubscribed = null;
  if (subRes.ok) {
    const subData = await subRes.json();
    isSubscribed = Array.isArray(subData.subscriptionStatuses)
      ? subData.subscriptionStatuses.some(s => s.status === 'SUBSCRIBED')
      : null;
  }

  // ── Return only what the frontend needs ──
  return Response.json(
    {
      firstname:  properties.firstname || '',
      lastname:   properties.lastname  || '',
      email:      properties.email || email,
      phone:      properties.phone || '',
      subscribed: isSubscribed,
      subscription,
      profileImageUrl: profileImageProperty ? (properties[profileImageProperty] || '') : '',
      profileImageFileId: properties.profile_image_file_id || ''
    },
    { headers: corsHdrs }
  );
}


// ============================================================
//  ROUTE 2: POST /api/subscriber-update
//  JSON body: originalEmail, uid, fp, updates
//  Updates only changed contact properties in HubSpot
// ============================================================
async function updateSubscriber(request, env, corsHdrs) {
  const body = await request.json().catch(() => null);
  const originalEmail = String(body?.originalEmail || '').trim();
  const uid = String(body?.uid || '').trim();
  const fp = String(body?.fp || '').trim();
  const updates = body?.updates && typeof body.updates === 'object' ? body.updates : null;

  if (!originalEmail || !isValidEmail(originalEmail)) {
    return Response.json(
      { error: 'Valid original email is required' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (!uid || !fp) {
    return Response.json(
      { error: 'Missing required parameters' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (!updates) {
    return Response.json(
      { error: 'No profile updates were provided' },
      { status: 400, headers: corsHdrs }
    );
  }

  const isValid = await validateFingerprint(originalEmail, uid, fp, env);
  // if (!isValid) {
  //   return Response.json(
  //     { error: 'Forbidden' },
  //     { status: 403, headers: corsHdrs }
  //   );
  // }

  const normalizedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'firstname')) {
    normalizedUpdates.firstname = String(updates.firstname || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'lastname')) {
    normalizedUpdates.lastname = String(updates.lastname || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    const nextEmail = String(updates.email || '').trim();
    if (!nextEmail || !isValidEmail(nextEmail)) {
      return Response.json(
        { error: 'A valid email address is required' },
        { status: 400, headers: corsHdrs }
      );
    }
    normalizedUpdates.email = nextEmail;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
    normalizedUpdates.phone = String(updates.phone || '').trim();
  }

  if (Object.keys(normalizedUpdates).length === 0) {
    return Response.json(
      { error: 'No supported profile changes were provided' },
      { status: 400, headers: corsHdrs }
    );
  }

  const hsHeaders = hubspotHeaders(env.HUBSPOT_TOKEN);
  const contactRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(originalEmail)}` +
    `?idProperty=email&properties=${encodeURIComponent('firstname,lastname,email,phone')}`,
    { headers: hsHeaders }
  );

  if (contactRes.status === 404) {
    return Response.json(
      { error: 'Subscriber not found' },
      { status: 404, headers: corsHdrs }
    );
  }

  if (!contactRes.ok) {
    return Response.json(
      { error: 'Failed to fetch subscriber before updating' },
      { status: 502, headers: corsHdrs }
    );
  }

  const contact = await contactRes.json();
  const contactId = contact.id;
  const currentProperties = contact.properties || {};
  const changedProperties = {};

  Object.entries(normalizedUpdates).forEach(([key, value]) => {
    const currentValue = String(currentProperties[key] || '').trim();
    if (value !== currentValue) {
      changedProperties[key] = value;
    }
  });

  const mergedProperties = {
    firstname: changedProperties.firstname ?? String(currentProperties.firstname || '').trim(),
    lastname: changedProperties.lastname ?? String(currentProperties.lastname || '').trim(),
    email: changedProperties.email ?? String(currentProperties.email || originalEmail).trim(),
    phone: changedProperties.phone ?? String(currentProperties.phone || '').trim()
  };

  if (Object.keys(changedProperties).length === 0) {
    return Response.json(
      {
        updated: false,
        message: 'No profile changes were detected.',
        updatedProperties: [],
        firstname: mergedProperties.firstname,
        lastname: mergedProperties.lastname,
        email: mergedProperties.email,
        phone: mergedProperties.phone
      },
      { headers: corsHdrs }
    );
  }

  const updateRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
    {
      method: 'PATCH',
      headers: hsHeaders,
      body: JSON.stringify({
        properties: changedProperties
      })
    }
  );

  if (!updateRes.ok) {
    const updateError = await safeJson(updateRes);
    return Response.json(
      { error: updateError.message || updateError.error || 'Failed to update subscriber' },
      { status: 502, headers: corsHdrs }
    );
  }

  return Response.json(
    {
      updated: true,
      message: 'Profile changes saved successfully.',
      updatedProperties: Object.keys(changedProperties),
      firstname: mergedProperties.firstname,
      lastname: mergedProperties.lastname,
      email: mergedProperties.email,
      phone: mergedProperties.phone
    },
    { headers: corsHdrs }
  );
}


// ============================================================
//  ROUTE 4: POST /api/profile-image
//  FormData: email, uid, fp, file
//  Uploads image to HubSpot Files and optionally stores URL on contact
// ============================================================
async function uploadProfileImage(request, env, corsHdrs) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const uid = String(formData.get('uid') || '').trim();
  const fp = String(formData.get('fp') || '').trim();
  const file = formData.get('file');

  if (!email || !isValidEmail(email)) {
    return Response.json(
      { error: 'Valid email is required' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (!uid || !fp) {
    return Response.json(
      { error: 'Missing required parameters' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (!(file instanceof File)) {
    return Response.json(
      { error: 'An image file is required' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (!file.type.startsWith('image/')) {
    return Response.json(
      { error: 'Only image uploads are supported' },
      { status: 400, headers: corsHdrs }
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: 'Image must be 10MB or smaller' },
      { status: 400, headers: corsHdrs }
    );
  }

  const hsHeaders = hubspotHeaders(env.HUBSPOT_TOKEN);
  const contactLookupRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}` +
    `?idProperty=email&properties=${encodeURIComponent(['profile_image_file_id'].join(','))}`,
    { headers: hsHeaders }
  );

  if (contactLookupRes.status === 404) {
    return Response.json(
      { error: 'Subscriber not found' },
      { status: 404, headers: corsHdrs }
    );
  }

  if (!contactLookupRes.ok) {
    const lookupError = await safeJson(contactLookupRes);
    return Response.json(
      { error: lookupError.message || lookupError.error || 'Failed to load current profile image details' },
      { status: 502, headers: corsHdrs }
    );
  }

  const contactData = await contactLookupRes.json();
  const previousFileId = String(contactData.properties?.profile_image_file_id || '').trim();

  const isValid = await validateFingerprint(email, uid, fp, env);
  // if (!isValid) {
  //   return Response.json(
  //     { error: 'Forbidden' },
  //     { status: 403, headers: corsHdrs }
  //   );
  // }

  const uploadForm = new FormData();
  const folderPath = env.PROFILE_IMAGE_FOLDER_PATH || '/subscription-portal/profile-images';
  const safeFileName = buildProfileImageFileName(email, file.name);
  const fileReplaceOptions = JSON.stringify({
    access: 'PUBLIC_NOT_INDEXABLE'
  });
  uploadForm.set('file', file, safeFileName);
  uploadForm.set('options', fileReplaceOptions);

  uploadForm.set('fileName', safeFileName);
  uploadForm.set('folderPath', folderPath);

  const uploadRes = await fetch('https://api.hubapi.com/files/v3/files', {
    method: 'POST',
    headers: hubspotAuthHeaders(env.HUBSPOT_TOKEN),
    body: uploadForm
  });

  if (!uploadRes.ok) {
    const uploadError = await safeJson(uploadRes);
    return Response.json(
      { error: uploadError.message || uploadError.error || 'Failed to upload image to HubSpot' },
      { status: 502, headers: corsHdrs }
    );
  }

  const uploadedFile = await uploadRes.json();
  const profileImageUrl = normalizeHubSpotFileUrl(uploadedFile);
  const profileImageProperty = sanitizePropertyName(env.HUBSPOT_PROFILE_IMAGE_PROPERTY || 'profile_image_path');

  if (profileImageProperty && profileImageUrl) {
    const updateRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
      {
        method: 'PATCH',
        headers: hubspotHeaders(env.HUBSPOT_TOKEN),
        body: JSON.stringify({
          properties: {
            [profileImageProperty]: profileImageUrl,
            profile_image_file_id: String(uploadedFile.id || '')
          }
        })
      }
    );

    if (!updateRes.ok) {
      const updateError = await safeJson(updateRes);
      return Response.json(
        {
          error: updateError.message || updateError.error || 'Image uploaded, but failed to update the contact property',
          profileImageUrl,
          storedOnContact: false
        },
        { status: 502, headers: corsHdrs }
      );
    }
  }

  let deleteDiagnostics = { attempted: [], deleted: [], failures: [] };
  if (previousFileId && uploadedFile.id && String(previousFileId) !== String(uploadedFile.id)) {
    deleteDiagnostics = await deleteFilesByIds([previousFileId], env.HUBSPOT_TOKEN);
  }

  return Response.json(
    {
      profileImageUrl,
      fileId: uploadedFile.id || '',
      storedOnContact: Boolean(profileImageProperty && profileImageUrl),
      contactProperty: profileImageProperty || '',
      deleteDiagnostics
    },
    { headers: corsHdrs }
  );
}


// ============================================================
//  ROUTE 2: GET /api/pdfs
//  Returns: { files: [{ id, name }] }
// ============================================================
async function getPdfs(env, corsHdrs) {
  const searchUrl = new URL('https://api.hubapi.com/files/v3/files/search');
  searchUrl.searchParams.set('parentFolderIds', String(env.PDF_FOLDER_ID));
  searchUrl.searchParams.set('limit', '50');

  const res = await fetch(searchUrl.toString(), {
    headers: hubspotHeaders(env.HUBSPOT_TOKEN)
  });

  if (!res.ok) {
    const errorBody = await safeJson(res);
    return Response.json(
      { error: errorBody.message || errorBody.error || 'Failed to fetch documents' },
      { status: 502, headers: corsHdrs }
    );
  }

  const data  = await res.json();
  const files = (data.results || []).map(f => ({
    id:   f.id,
    name: f.name.replace(/\.pdf$/i, '')
  }));

  return Response.json({ files }, { headers: corsHdrs });
}

// ============================================================
//  ROUTE 3: GET /api/pdfs-by-folder?id=FOLDERID
//  Returns: { files: [{ id, name, path, thumbnail }] }
// ============================================================
async function getPdfsByFolder(url, env, corsHdrs) {
  const folderId = String(url.searchParams.get('id') || '209745447557').trim();
  const debugMode = url.searchParams.get('debug') === '1';

  if (!/^\d+$/.test(folderId)) {
    return Response.json(
      { error: 'Invalid folder ID' },
      { status: 400, headers: corsHdrs }
    );
  }

  const folderRes = await fetch(
    `https://api.hubapi.com/files/v3/folders/${folderId}`,
    { headers: hubspotHeaders(env.HUBSPOT_TOKEN) }
  );

  if (folderRes.status === 404) {
    return Response.json(
      { error: 'Folder not found' },
      { status: 404, headers: corsHdrs }
    );
  }

  if (!folderRes.ok) {
    return Response.json(
      { error: 'Failed to fetch folder details' },
      { status: 502, headers: corsHdrs }
    );
  }

  const folder = await folderRes.json();
  const filesResult = await fetchFilesByParentFolder(folderId, env.HUBSPOT_TOKEN);

  if (!filesResult.ok) {
    return Response.json(
      { error: filesResult.error || 'Failed to fetch documents' },
      { status: 502, headers: corsHdrs }
    );
  }

  const files = mapPdfFiles(filesResult.files);

  if (debugMode) {
    return Response.json(
      {
        folder: {
          id: folder.id,
          path: folder.path || '',
          name: folder.name || ''
        },
        matchCount: filesResult.files.length,
        pdfCount: files.length,
        sampleMatches: filesResult.files.slice(0, 20).map(file => ({
          id: file.id || '',
          name: file.name || '',
          path: file.path || '',
          parentFolderId: file.parentFolderId || '',
          type: file.type || '',
          archived: Boolean(file.archived)
        }))
      },
      { headers: corsHdrs }
    );
  }

  return Response.json(
    {
      folder: {
        id: folder.id,
        path: folder.path || ''
      },
      files
    },
    { headers: corsHdrs }
  );
}


// ============================================================
//  ROUTE 3: GET /api/pdf-url?id=FILEID
//  Returns: { url, expiresAt } — signed URL expires in 5 mins
// ============================================================
async function getPdfSignedUrl(url, env, corsHdrs) {
  const fileId = url.searchParams.get('id');

  if (!fileId || !/^\d+$/.test(fileId)) {
    return Response.json(
      { error: 'Invalid file ID' },
      { status: 400, headers: corsHdrs }
    );
  }

  const res = await fetch(
    `https://api.hubapi.com/files/v3/files/${fileId}/signed-url?expirationSeconds=300`,
    { headers: hubspotHeaders(env.HUBSPOT_TOKEN) }
  );

  if (res.status === 404) {
    return Response.json(
      { error: 'File not found' },
      { status: 404, headers: corsHdrs }
    );
  }
  if (!res.ok) {
    return Response.json(
      { error: 'Failed to generate download link' },
      { status: 502, headers: corsHdrs }
    );
  }

  const data = await res.json();
  return Response.json(
    { url: data.url, expiresAt: data.expiresAt },
    { headers: corsHdrs }
  );
}

// ============================================================
//  ROUTE 4: GET /api/pdf-download?id=FILEID&name=FILENAME
//  Streams the HubSpot file back as a download attachment
// ============================================================
async function downloadPdf(url, env, corsHdrs) {
  const fileId = url.searchParams.get('id');
  const requestedName = sanitizeDownloadName(url.searchParams.get('name') || 'document');

  if (!fileId || !/^\d+$/.test(fileId)) {
    return Response.json(
      { error: 'Invalid file ID' },
      { status: 400, headers: corsHdrs }
    );
  }

  const signedUrlRes = await fetch(
    `https://api.hubapi.com/files/v3/files/${fileId}/signed-url?expirationSeconds=300`,
    { headers: hubspotHeaders(env.HUBSPOT_TOKEN) }
  );

  if (signedUrlRes.status === 404) {
    return Response.json(
      { error: 'File not found' },
      { status: 404, headers: corsHdrs }
    );
  }
  if (!signedUrlRes.ok) {
    return Response.json(
      { error: 'Failed to generate download link' },
      { status: 502, headers: corsHdrs }
    );
  }

  const signedUrlData = await signedUrlRes.json();
  const fileRes = await fetch(signedUrlData.url);

  if (!fileRes.ok) {
    return Response.json(
      { error: 'Failed to download file from HubSpot' },
      { status: 502, headers: corsHdrs }
    );
  }

  const headers = new Headers(corsHdrs);
  headers.set('Content-Type', fileRes.headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `attachment; filename="${requestedName}.pdf"`);

  return new Response(fileRes.body, {
    status: 200,
    headers
  });
}


// ============================================================
//  FINGERPRINT VALIDATION
//  Recomputes SHA-256 from submitted values and compares
// ============================================================
async function validateFingerprint(email, uid, fpFromClient, env) {
  // Must match exact format used in the HTML module:
  // btoa(userId + '|' + portalId + '|' + email + '|' + username + '|' + createdDate)
  // We decode the base64 and recompute the SHA-256
  try {
    const decoded = atob(fpFromClient);           // e.g. "42|0|user@email.com|jdoe|2023-04-15"
    const parts   = decoded.split('|');

    if (parts.length < 5)         return false;
    if (parts[0] !== uid)         return false;   // userId must match uid param
    if (!/^\d+$/.test(parts[0]))  return false;   // userId must be numeric
    if (!/^\d+$/.test(parts[1]))  return false;   // portalId must be numeric
    if (parts[2] !== email)       return false;   // email must match email param

    // Recompute SHA-256 of the raw string
    const rawFingerprint = decoded;
    const encoded        = new TextEncoder().encode(rawFingerprint);
    const buffer         = await crypto.subtle.digest('SHA-256', encoded);
    const hash           = Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // At this point structure is valid — hash is for future HMAC upgrade
    // For now: structural validation + field matching is the security layer
    return true;

  } catch {
    return false;
  }
}


// ============================================================
//  HELPERS
// ============================================================
function hubspotHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json'
  };
}

function hubspotAuthHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`
  };
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type':                 'application/json',
    'Vary':                         'Origin'
  };
}

function corsPreflightResponse(origin) {
  return new Response(null, {
    status:  204,
    headers: corsHeaders(origin)
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getCorsOrigin(requestOrigin, allowedOrigin) {
  const defaultOrigins = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]);

  const configuredOrigins = String(allowedOrigin || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.includes('*')) {
    return requestOrigin || '*';
  }

  configuredOrigins.forEach(origin => defaultOrigins.add(origin));

  if (!requestOrigin) {
    return configuredOrigins[0] || '*';
  }

  if (defaultOrigins.has(requestOrigin)) {
    return requestOrigin;
  }

  return configuredOrigins[0] || 'http://localhost:3000';
}

function sanitizePropertyName(value) {
  const propertyName = String(value || '').trim();
  return propertyName || '';
}

function buildProfileImageFileName(email, originalName) {
  const extensionMatch = String(originalName || '').toLowerCase().match(/\.[a-z0-9]+$/);
  const extension = extensionMatch ? extensionMatch[0] : '.png';
  const slug = email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'contact'}-profile${extension}`;
}

async function deleteFilesByIds(fileIds, token) {
  const attempted = fileIds
    .map(fileId => String(fileId || '').trim())
    .filter(Boolean)
    .map(fileId => ({ id: fileId }));

  const deleteResults = await Promise.all(attempted.map(async file => {
    const response = await fetch(`https://api.hubapi.com/files/v3/files/${file.id}`, {
      method: 'DELETE',
      headers: hubspotAuthHeaders(token)
    }).catch(() => null);

    if (!response) {
      return {
        ok: false,
        id: String(file.id),
        status: 0,
        body: { error: 'Delete request failed before receiving a response' }
      };
    }

    return {
      ok: response.ok,
      id: String(file.id),
      status: response.status,
      body: response.ok ? {} : await safeJson(response)
    };
  }));

  return {
    attempted,
    deleted: deleteResults.filter(result => result.ok).map(result => result.id),
    failures: deleteResults
      .filter(result => !result.ok)
      .map(result => ({
        id: result.id,
        status: result.status,
        body: result.body
      }))
  };
}

function normalizeHubSpotFileUrl(file) {
  const rawUrl = file?.url || file?.defaultHostingUrl || '';
  if (!rawUrl) {
    return '';
  }

  if (rawUrl.startsWith('//')) {
    return `https:${rawUrl}`;
  }

  if (rawUrl.startsWith('/')) {
    return `https://api.hubapi.com${rawUrl}`;
  }

  return rawUrl;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function sanitizeDownloadName(value) {
  return String(value || 'document')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'document';
}

function buildResourceThumbnail(fileName) {
  const normalized = String(fileName || '').toLowerCase();

  if (normalized.includes('communication')) {
    return 'img/L301US_2022_05_COMBINED_thumbnail.png';
  }
  if (normalized.includes('compatibility')) {
    return 'img/press2.png';
  }
  if (normalized.includes('strength')) {
    return 'img/press3.png';
  }

  return 'img/press1.png';
}

async function fetchFilesByParentFolder(folderId, token) {
  const searchUrl = new URL('https://api.hubapi.com/files/v3/files/search');
  searchUrl.searchParams.set('parentFolderIds', String(folderId));
  searchUrl.searchParams.set('limit', '100');
  searchUrl.searchParams.set('sort', 'name');

  const response = await fetch(searchUrl.toString(), {
    headers: hubspotHeaders(token)
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    return {
      ok: false,
      error: errorBody.message || errorBody.error || 'Failed to fetch documents',
      files: []
    };
  }

  const data = await response.json();
  return {
    ok: true,
    files: Array.isArray(data.results) ? data.results : []
  };
}

function mapPdfFiles(files) {
  return (files || [])
    .filter(file =>
      file &&
      !file.archived &&
      (
        /\.pdf$/i.test(file.path || '') ||
        String(file.type || '').toUpperCase() === 'DOCUMENT'
      )
    )
    .map(file => ({
      id: file.id,
      name: String(file.name || '').replace(/\.pdf$/i, ''),
      path: file.path || '',
      thumbnail: buildResourceThumbnail(file.name)
    }));
}
