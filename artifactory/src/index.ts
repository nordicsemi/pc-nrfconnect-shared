// import { mkdir, readFile, writeFile } from "fs/promises";
// import { dirname, resolve } from "path";
import { type AQLdata, NordicURL, searchAQL } from './artifactoryFetcher.ts';

const testData: AQLdata = {
    server: NordicURL,
    repo: 'swtools',
};

console.log(JSON.stringify(searchAQL(testData)));
