export interface RequestLoadCookiesFromFile {
  dbPath: string;
  isReadOnly: boolean;
}


export interface RequestWriteCookiesToFile {
    cookiesFilePath : string,
    chunkedInsertValues : any[][],
}