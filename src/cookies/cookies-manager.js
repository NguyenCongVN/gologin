import Database from 'better-sqlite3';

/**
MAX_SQLITE_VARIABLES is a constant defined in the code with a value of
76. This constant is used in the getChunckedInsertValues function to split the
cookiesArr parameter into chunks with a maximum size of 76.
This is because SQLite has a limit on the number of variables that can
be used in a single SQL statement. This limit is 999 by default, but it
can be lower depending on the platform and the version of SQLite being used. To
avoid hitting this limit, the cookiesArr array is split into smaller chunks of
76 cookies or less, and each chunk is inserted into the database as a
separate SQL statement.
**/
const MAX_SQLITE_VARIABLES = 76;

/**
* SameSite is a cookie attribute that can be set to one of three values:
"Strict", "Lax", or "None".

It is used to control how cookies are sent with cross-site requests. The
attribute is added to a cookie by a web server to instruct a browser
whether to include the cookie in cross-site requests.

If SameSite attribute is set to "Strict", then the cookie is not sent
with any cross-site requests, i.e. the cookie will only be sent with
requests originating from the same site that set the cookie.

If SameSite attribute is set to "Lax", then the cookie is only sent with
"safe" cross-site requests, such as those initiated by clicking on a
link.

If SameSite attribute is set to "None", then the cookie will be sent
with all cross-site requests, but only if the cookie is marked as secure
(i.e., sent over HTTPS).

The SameSite attribute can help prevent certain types of cross-site
request forgery (CSRF) attacks, which can occur when a website's cookies
are sent to another site without the user's knowledge or consent.
 **/
const SAME_SITE = {
  '-1': 'unspecified',
  0: 'no_restriction',
  1: 'lax',
  2: 'strict',
};

/**
 * getDB(filePath, readOnly = true): A function that returns a connection to a
SQLite database at the given file path. The connection can be opened in
read-only mode if the readOnly argument is true. This function uses the open
method from the sqlite package and the Database class from the sqlite3 package.
 * @param {*} filePath
 * @param {*} readOnly
 * @returns
 */
export const getDB = (filePath, readOnly = true) => {
  const connectionOpts = {
    readonly: readOnly,
  };

  return new Database(filePath, connectionOpts);
};

/** getChunckedInsertValues(cookiesArr, db): A function that takes an array of
cookies and returns an array of queries and their corresponding
parameters that can be used to insert the cookies into a SQLite
database. This function chunks the cookies array into smaller arrays of
up to 76 cookies (the maximum number of variables allowed in a SQLite
query) and generates a separate query for each chunk. The queries use
placeholders for the cookie values to avoid SQL injection vulnerabilities.
After that, the function uses the run method from the sqlite3 package to
execute the queries and insert the cookies into the database.
* @param {*} cookiesArr
 **/
export const getChunckedInsertValuesAndInsert = (cookiesArr, db) => {
  const todayUnix = Math.floor(new Date().getTime() / 1000.0);
  const chunckedCookiesArr = chunk(cookiesArr, MAX_SQLITE_VARIABLES);

  return chunckedCookiesArr.map((cookies) => {
    const queryPlaceholders = cookies.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const query = `insert or replace into cookies (creation_utc, host_key, top_frame_site_key,
       name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, 
       has_expires, is_persistent, priority, samesite, source_scheme, source_port, is_same_party, last_update_utc) values ${queryPlaceholders}`;

    const queryParams = cookies.flatMap((cookie) => {
      const creationDate = cookie.creationDate ? cookie.creationDate : unixToLDAP(todayUnix);
      let expirationDate = cookie.session ? 0 : unixToLDAP(cookie.expirationDate);
      const encryptedValue = cookie.value;
      const samesite = Object.keys(SAME_SITE).find((key) => SAME_SITE[key] === (cookie.sameSite || '-1'));
      const isSecure =
        cookie.name.startsWith('__Host-') || cookie.name.startsWith('__Secure-') ? 1 : Number(cookie.secure);

      const sourceScheme = isSecure === 1 ? 2 : 1;
      const sourcePort = isSecure === 1 ? 443 : 80;
      // eslint-disable-next-line no-undefined
      let isPersistent = [undefined, null].includes(cookie.session)
        ? Number(expirationDate !== 0)
        : Number(!cookie.session);

      // This likely means that the cookie should be immediately deleted, as it has
      // already expired or should no longer be stored persistently.
      if (/^(\.)?mail.google.com$/.test(cookie.domain) && cookie.name === 'COMPASS') {
        expirationDate = 0;
        isPersistent = 0;
      }

      return [
        creationDate,
        cookie.domain,
        '', // top_frame_site_key
        cookie.name,
        '', // value
        encryptedValue,
        cookie.path,
        expirationDate,
        isSecure,
        Number(cookie.httpOnly),
        0, // last_access_utc
        expirationDate === 0 ? 0 : 1, // has_expires
        isPersistent,
        1, // default priority value
        // (https://github.com/chromium/chromium/blob/main/net/cookies/cookie_constants.h)
        samesite,
        sourceScheme,
        sourcePort,
        0, // is_same_party
        0, // last_update_utc
      ];
    });

    // modify it here
    const insertCookies = db.prepare(query);
    insertCookies.run(queryParams);

    return [query, queryParams];
  });
};

// loadCookiesFromFile(filePath): A function that loads cookies from a SQLite
// database file at the given file path and returns an array of cookie objects.
// This function queries the cookies table of the database and maps the resulting
// rows to cookie objects that include properties such as name, value, domain,
// path, httpOnly, secure, session, and expirationDate.
export const loadCookiesFromFile = async (filePath) => {
  const db = getDB(filePath);
  const cookies = [];

  try {
    const cookiesRows = await db.all('select * from cookies');
    for (const row of cookiesRows) {
      const {
        host_key,
        name,
        encrypted_value,
        path,
        is_secure,
        is_httponly,
        expires_utc,
        is_persistent,
        samesite,
        creation_utc,
      } = row;

      cookies.push({
        url: buildCookieURL(host_key, is_secure, path),
        domain: host_key,
        name,
        value: encrypted_value,
        path,
        sameSite: SAME_SITE[samesite],
        secure: Boolean(is_secure),
        httpOnly: Boolean(is_httponly),
        hostOnly: !host_key.startsWith('.'),
        session: !is_persistent,
        expirationDate: ldapToUnix(expires_utc),
        creationDate: ldapToUnix(creation_utc),
      });
    }
  } catch (error) {
    console.log(error);
  } finally {
    db.close();
  }

  return cookies;
};

/**
* unixToLDAP(unixtime): A function that converts a Unix timestamp (in
seconds) to a Microsoft LDAP timestamp (in 100-nanosecond intervals
since January 1, 1601 UTC).
* @param {*} unixtime
* @returns
 **/
export const unixToLDAP = (unixtime) => {
  if (unixtime === 0) {
    return unixtime;
  }

  const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime() / 1000;
  const sum = unixtime - win32filetime;

  return sum * 1000000;
};

// ldapToUnix(ldap): A function that converts a Microsoft LDAP timestamp (in
//   100-nanosecond intervals since January 1, 1601 UTC) to a Unix timestamp (in
//   seconds).
export const ldapToUnix = (ldap) => {
  const ldapLength = ldap.toString().length;
  if (ldap === 0 || ldapLength > 18) {
    return ldap;
  }

  let _ldap = ldap;
  if (ldapLength < 18) {
    _ldap = Number(_ldap + '0'.repeat(18 - ldapLength));
  }

  const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime();

  return (_ldap / 10000 + win32filetime) / 1000;
};

/**
* buildCookieURL(domain, secure, path): A function that takes a cookie's
domain,
secure flag, and path and returns the URL that the cookie applies to
* @param {*} domain
* @param {*} secure
* @param {*} path
* @returns
 **/
export const buildCookieURL = (domain, secure, path) => {
  let domainWithoutDot = domain;
  if (domain.startsWith('.')) {
    domainWithoutDot = domain.substr(1);
  }

  return 'http' + (secure ? 's' : '') + '://' + domainWithoutDot + path;
};

/**
 * chunk(arr, chunkSize = 1, cache = []): A function that takes an array and
returns an array of arrays, where each subarray has up to chunkSize elements.
This function is used by getChunckedInsertValues to split the cookies array
into smaller array
 * @param {*} arr
 * @param {*} chunkSize
 * @param {*} cache
 * @returns
 */
export const chunk = (arr, chunkSize = 1, cache = []) => {
  const tmp = [...arr];
  if (chunkSize <= 0) {
    return cache;
  }

  while (tmp.length) {
    cache.push(tmp.splice(0, chunkSize));
  }

  return cache;
};
