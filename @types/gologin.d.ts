declare module "gologin" {
  export interface GoLoginOptions {
    remote?: boolean;
    token?: string;
    profile_id?: string;
    password?: string;
    extra_params?: any;
    executablePath?: string;
    vncPort?: number;
    waitWebsocket?: boolean;
    tmpdir?: string;
    autoUpdateBrowser?: boolean;
    skipOrbitaHashChecking?: boolean;
    uploadCookiesToServer?: boolean;
    writeCookesFromServer?: any;
    remote_debugging_port?: number;
    timezone?: string;
    restoreLastSession?: boolean;
  }

  export class GoLogin {
    is_remote: boolean;
    access_token: string;
    profile_id: string;
    password: string;
    extra_params: any;
    executablePath: string;
    vnc_port: number;
    fontsMasking: boolean;
    is_active: boolean;
    is_stopping: boolean;
    differentOs: boolean;
    profileOs: string;
    waitWebsocket: boolean;
    tmpdir: string;
    autoUpdateBrowser: boolean;
    browserChecker: any;
    uploadCookiesToServer: boolean;
    writeCookesFromServer: any;
    remote_debugging_port: number;
    timezone: string;
    extensionPathsToInstall: any[];
    restoreLastSession: boolean;
    cookiesFilePath: string;
    profile_zip_path: string;

    constructor(options?: GoLoginOptions);

    async start(): Promise<any>;
    async startLocal(): Promise<any>;
    async startRemote(delay_ms: number): Promise<any>;
    async stop(): Promise<any>;
    async stopAndCommit(options : any, local = false) : Promise<any>;
    async stopBrowser(): Promise<any>;
    async stopLocal(options : any) : Promise<any>;
    async stopRemote() : Promise<any>;
    async update(options : any, local = false) : Promise<any>;
    async uploadProfileCookiesToServer() : Promise<any>;
    async waitDebuggingUrl(delay_ms : number, try_count = 0) : Promise<any>;
    async writeCookiesToFile() : Promise<any>;
    async spawnBrowser() : Promise<any>;
    async spawnArguments() : Promise<any>;
    async setProfileId(profile_id : string) : Promise<any>;
    setActive(is_active : boolean) : void;
    async sanitizeProfile() : Promise<any>;
    async profiles() : Promise<any>;
    profilePath() : string;
    async profileExists() : Promise<any>;
    profileArgumentLocalPath() : string;
    async postFile(fileName : string, fileBuff : any) : Promise<any>;
    orbitaExtensionPath() : string;
    getZipProfilePath() : string;
    getViewPort() : string;
    async getToken(username : string, password : string) : Promise<any>;
    async getTimezoneWithSocks(params : any) : Promise<any>;
    async getTimeZone(proxy : any) : Promise<any>;
    async getRandomFingerprint(options = {}) : Promise<any>;
    async getProfileS3(s3path : string) : Promise<any>;
    async getProfileDataZip() : Promise<any>;
    async create(options = {}) : Promise<any>;
}
}
