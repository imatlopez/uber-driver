const fs = require("fs"),
  Papa = require("papaparse"),
  puppeteer = require("puppeteer-core");

async function getTrip(browser, wait, line) {
  const page = await browser.newPage();
  await page.goto(
    `https://drivers.uber.com/p3/payments/v2/trips/${encodeURIComponent(
      line[4]
    )}`,
    {
      waitUntil: "load",
    }
  );

  if (wait) {
    await new Promise((res) => setTimeout(res, wait));
  }

  const data = await page.evaluate(() => {
    const getText = (query) =>
      Array.from(document.querySelectorAll(query)).map(
        (node) => node.innerText
      );

    const [start, end] = getText(".b1.ay.b2.b3.ao.b4.b5.b6.b7 > div + div");

    let [, distance] = getText(".bv.bw");
    if (!distance) [, distance] = getText(".cp.cq");
    if (!distance) [, distance] = getText(".cu.cv");

    return {
      start,
      end,
      distance: +distance.split(" ")[0],
    };
  });

  await page.close();

  return {
    date: new Date(line[3]).toISOString(),
    ...data,
  };
}

async function main(filename) {
  const csv = await new Promise((resolve) => {
    Papa.parse(fs.createReadStream(filename), {
      complete(res) {
        resolve(res.data);
      },
    });
  });

  // skip header
  csv.splice(0, 1);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--window-size=800,600", `--user-data-dir=chrome`],
  });

  // one trip in case you need to log in
  const trips = [await getTrip(browser, 0, csv.splice(0, 1)[0])];

  const groups = [],
    groupSize = 5;
  for (let i = 0; i < csv.length; i += groupSize) {
    groups.push(csv.slice(i, i + groupSize));
  }

  for (const group of groups) {
    trips.push(
      ...(await Promise.all(group.map(getTrip.bind(undefined, browser, 0))))
    );
  }
  await browser.close();

  const data = [
    "rates >>>,business $,0.575,medical $,0.17,charity $,0.14,moving $,0.17",
    "",
    "SUMMARY",
    "",
    "VEHICLE,ODOMETER (START OF YEAR),BUSINESS,COMMUTE,PERSONAL (OTHER),TOTAL DISTANCE,BUSINESS VALUE IN $,PARKING IN $,TOLLS IN $,TOTAL VALUE IN $,MEDICAL,MOVING,CHARITY",
    'Missing Vehicle,0,48.0,0.0,0.0,48.0,"=ROUND(PRODUCT(C6, C1), 2)",0.00,0.00,"=ROUND(SUM(G6, H6, I6), 2)",0.0,0.0,0.0',
    ",TOTALS,=SUM(C6:C6),=SUM(D6:D6),=SUM(E6:E6),=SUM(F6:F6),=SUM(G6:G6),=SUM(H6:H6),=SUM(I6:I6),=SUM(J6:J6),=SUM(K6:K6),=SUM(L6:L6),=SUM(M6:M6)",
    "",
    "DETAILED LOG",
    "",
    "START_DATE*,END_DATE*,CATEGORY*,START*,STOP*,MILES*,MILES_VALUE,PARKING,TOLLS,TOTAL,VEHICLE,PURPOSE,NOTES",
    ...trips.map(
      (trip) =>
        `${trip.date},${trip.date},Business,"${trip.start}","${trip.end}",${trip.distance},"=ROUND(PRODUCT(F12, C1), 2)",0,0,0,,"Uber",`
    ),
    "Totals,,,,,=SUM(F12:F12),=SUM(G12:G12),=SUM(H12:H12),=SUM(I12:I12),=SUM(J12:J12)",
    "",
    "Report created at MileIQ.com",
    "",
    "This spreadsheet uses formulas to calculate the MILES_VALUE and TOTAL values.",
    '"Changing the values in cells C1, E1 and G1 will automatically update the MILES* value and TOTAL values."',
    "Saving the spreadsheet will remove the formulas and leave just the calculated values in the saved spreadsheet.",
    "",
    '"* For an IRS compliant log, these are required for every drive."',
  ];

  fs.writeFileSync("output.csv", data.join("\n"));
}

main(process.argv[2]).catch((e) => console.error(e));
