const path = require('path');
const express = require('express');
const Redis = require("ioredis");
const mysql = require('mysql');
const nconf = require('nconf');

const cnf = nconf.argv().env().file({ file: path.resolve(__dirname + '/config.json') });
const app = express();
const client = new Redis(cnf.get('resources:redis'));

let connection = mysql.createConnection(cnf.get('resources:mysql'));

connection.connect(e => { if (e) throw e; } );

app.get('/campaign_info/:number', getCampaignInfo);

async function getCampaignInfo(req, res, next) {
    if (!req.params || !req.params.number) return res.send(``);

    let cid = null;
    const number = req.params.number;
    const subtenantId = await client.get(`qooqie:poule_number_subtenant:${number}`);

    if (!subtenantId) {
        // try campaigns in mysql
        const qry = connection.format(`SELECT name FROM campaigns WHERE phone_number = ?`, number);
        return connection.query(qry, (error, results, fields) => {
           if (error || !results.length || !results[0].name || !results[0].name.length)
               return res.send(``);

           return res.send(`${results[0].name.replace(/ /g, '_')}`);
        });
    }

    const numbersList = await client.lrange(`qooqie:${subtenantId}:cid_subtenant_list`, 0, -1);

    if (!numbersList || !numbersList.length) return res.send(``);

    numbersList.forEach(k => k.indexOf(number) > 0 ? cid = k.split(':')[3] : '');

    if (!cid) return res.send(``);

    let session = await client.get(`qooqie:${cid}:cid_session`);

    if (!session || !session.length) return res.send(``);

    try {
        session = JSON.parse(session);
    } catch (e) {
        return res.send(``);
    }

    const campaignName = await client.hget(`qooqie:${session.source}:${subtenantId}:campaign_identifier`, 'campaign_name');

    if (!campaignName) return res.send(``);

    res.send(`${campaignName.replace(/ /g, '_')}`);
}

app.listen(cnf.get('bind:port'));
console.log(`Express started on port ${cnf.get('bind:port')}`);
