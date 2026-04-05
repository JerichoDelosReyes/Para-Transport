export type TricycleTerminalFallback = {
  id: string;
  name: string;
  city?: string | null;
  latitude: number;
  longitude: number;
};

const TRICYCLE_TERMINALS_FALLBACK: TricycleTerminalFallback[] = [
  {
    "id": "tric-brookside-tricycle-station-001",
    "name": "Brookside Tricycle Station",
    "city": "General Trias",
    "latitude": 14.2927408,
    "longitude": 120.9241743
  },
  {
    "id": "tric-cardinal-village-tricycle-station-002",
    "name": "Cardinal Village Tricycle Station",
    "city": null,
    "latitude": 14.3465202,
    "longitude": 120.9462649
  },
  {
    "id": "tric-scsev-tricycle-station-003",
    "name": "SCSEV Tricycle Station",
    "city": null,
    "latitude": 14.2994428,
    "longitude": 120.9650587
  },
  {
    "id": "tric-mca-toda-terminal-004",
    "name": "MCA TODA Terminal",
    "city": "Imus",
    "latitude": 14.3757565,
    "longitude": 120.938679
  },
  {
    "id": "tric-tricycle-terminal-5-005",
    "name": "Tricycle Terminal 5",
    "city": null,
    "latitude": 14.2876954,
    "longitude": 121.000448
  },
  {
    "id": "tric-tricycle-terminal-6-006",
    "name": "Tricycle Terminal 6",
    "city": "Dasmarinas",
    "latitude": 14.3365592,
    "longitude": 120.9547122
  },
  {
    "id": "tric-viva-homes-tricycle-station-007",
    "name": "Viva Homes Tricycle Station",
    "city": null,
    "latitude": 14.3370074,
    "longitude": 120.9861365
  },
  {
    "id": "tric-troddac-tricycle-station-008",
    "name": "TRODDAC Tricycle Station",
    "city": null,
    "latitude": 14.3226251,
    "longitude": 120.941207
  },
  {
    "id": "tric-rpd-tc-hub-009",
    "name": "RPD TC Hub",
    "city": null,
    "latitude": 14.3010684,
    "longitude": 120.9534187
  },
  {
    "id": "tric-malabon-tricycle-terminal-010",
    "name": "Malabon Tricycle Terminal",
    "city": "General Trias",
    "latitude": 14.3816934,
    "longitude": 120.8789175
  },
  {
    "id": "tric-bbs-toda-011",
    "name": "BBS Toda",
    "city": null,
    "latitude": 14.3193353,
    "longitude": 120.7638845
  },
  {
    "id": "tric-toda-012",
    "name": "TODA",
    "city": null,
    "latitude": 14.144139,
    "longitude": 120.7864765
  },
  {
    "id": "tric-via-modena-tricycle-terminal-013",
    "name": "Via Modena Tricycle Terminal",
    "city": null,
    "latitude": 14.3196295,
    "longitude": 120.8949312
  },
  {
    "id": "tric-sm-city-bacoor-tricycle-terminal-014",
    "name": "SM City Bacoor Tricycle Terminal",
    "city": null,
    "latitude": 14.4456823,
    "longitude": 120.9498098
  },
  {
    "id": "tric-wp-shuttle-service-station-015",
    "name": "WP Shuttle Service Station",
    "city": null,
    "latitude": 14.2751845,
    "longitude": 120.9655375
  },
  {
    "id": "tric-pasong-buaya-ii-toda-016",
    "name": "Pasong Buaya II TODA",
    "city": "Imus",
    "latitude": 14.3886325,
    "longitude": 120.9676659
  },
  {
    "id": "tric-statefields-tricycle-terminal-017",
    "name": "Statefields Tricycle Terminal",
    "city": "Bacoor",
    "latitude": 14.3925269,
    "longitude": 120.9782205
  },
  {
    "id": "tric-st-john-fisher-tricycle-terminal-018",
    "name": "St. John Fisher Tricycle Terminal",
    "city": "Bacoor",
    "latitude": 14.3887064,
    "longitude": 120.9806267
  },
  {
    "id": "tric-somo-tricycle-terminal-019",
    "name": "SOMO Tricycle Terminal",
    "city": "Bacoor",
    "latitude": 14.3858629,
    "longitude": 120.9803201
  },
  {
    "id": "tric-fcie-tricycle-station-020",
    "name": "FCIE Tricycle Station",
    "city": null,
    "latitude": 14.2912505,
    "longitude": 120.9321892
  },
  {
    "id": "tric-paliparan-site-tricycle-station-021",
    "name": "Paliparan Site Tricycle Station",
    "city": null,
    "latitude": 14.3213326,
    "longitude": 120.9838889
  },
  {
    "id": "tric-tricycle-terminal-22-022",
    "name": "Tricycle Terminal 22",
    "city": null,
    "latitude": 14.3160219,
    "longitude": 120.9315356
  },
  {
    "id": "tric-ghs-toda-tricycle-station-023",
    "name": "GHS-TODA Tricycle Station",
    "city": null,
    "latitude": 14.2833921,
    "longitude": 120.9612729
  },
  {
    "id": "tric-bipra-toda-terminal-024",
    "name": "Bipra TODA Terminal",
    "city": "Kawit",
    "latitude": 14.4280882,
    "longitude": 120.893883
  },
  {
    "id": "tric-tricycle-terminal-25-025",
    "name": "Tricycle Terminal 25",
    "city": null,
    "latitude": 14.3713774,
    "longitude": 120.9381186
  },
  {
    "id": "tric-tricycle-terminal-26-026",
    "name": "Tricycle Terminal 26",
    "city": "Imus",
    "latitude": 14.3652224,
    "longitude": 120.9381009
  },
  {
    "id": "tric-tricycle-terminal-27-027",
    "name": "Tricycle Terminal 27",
    "city": null,
    "latitude": 14.2909293,
    "longitude": 121.0038519
  },
  {
    "id": "tric-anabu-pasong-buaya-i-ragatan-daang-hari--028",
    "name": "Anabu-Pasong Buaya I-Ragatan-Daang Hari Tricycle Terminal",
    "city": "Imus",
    "latitude": 14.3768066,
    "longitude": 120.9397222
  },
  {
    "id": "tric-bucandala-tricycle-station-029",
    "name": "Bucandala Tricycle Station",
    "city": "Imus",
    "latitude": 14.4066804,
    "longitude": 120.9401432
  },
  {
    "id": "tric-sm-trece-toda-030",
    "name": "SM Trece TODA",
    "city": null,
    "latitude": 14.2808374,
    "longitude": 120.8667722
  },
  {
    "id": "tric-tricycle-terminal-31-031",
    "name": "Tricycle Terminal 31",
    "city": null,
    "latitude": 14.4241364,
    "longitude": 120.9417217
  },
  {
    "id": "tric-bipra-toda-terminal-south-032",
    "name": "Bipra TODA Terminal South",
    "city": "Imus",
    "latitude": 14.407454,
    "longitude": 120.9030678
  },
  {
    "id": "tric-bipra-toda-bucandala-terminal-033",
    "name": "BIPRA TODA Bucandala Terminal",
    "city": null,
    "latitude": 14.405515,
    "longitude": 120.9252722
  },
  {
    "id": "tric-tricycle-terminal-34-034",
    "name": "Tricycle Terminal 34",
    "city": null,
    "latitude": 14.1031558,
    "longitude": 120.941612
  },
  {
    "id": "tric-toda-035",
    "name": "TODA",
    "city": null,
    "latitude": 14.2342639,
    "longitude": 120.6595997
  },
  {
    "id": "tric-mbt-toda-tricycle-terminal-036",
    "name": "MBT TODA Tricycle Terminal",
    "city": null,
    "latitude": 14.2738412,
    "longitude": 120.7350134
  },
  {
    "id": "tric-mgv-toda-tricycle-terminal-037",
    "name": "MGV Toda Tricycle Terminal",
    "city": "Bacoor",
    "latitude": 14.4054482,
    "longitude": 120.9781574
  },
  {
    "id": "tric-buhay-na-tubig-tricycle-terminal-038",
    "name": "Buhay na Tubig Tricycle Terminal",
    "city": null,
    "latitude": 14.4069782,
    "longitude": 120.9565696
  },
  {
    "id": "tric-tricycle-terminal-039",
    "name": "Tricycle Terminal",
    "city": null,
    "latitude": 14.4273058,
    "longitude": 120.9446528
  },
  {
    "id": "tric-tricycle-terminal-40-040",
    "name": "Tricycle Terminal 40",
    "city": null,
    "latitude": 14.3617591,
    "longitude": 120.9280967
  },
  {
    "id": "tric-mambog-tricycle-terminal-041",
    "name": "Mambog Tricycle Terminal",
    "city": null,
    "latitude": 14.424497,
    "longitude": 120.947153
  },
  {
    "id": "tric-buhay-na-tubig-tricycle-terminal-042",
    "name": "Buhay na Tubig Tricycle Terminal",
    "city": null,
    "latitude": 14.4251971,
    "longitude": 120.9437166
  },
  {
    "id": "tric-palico-tricycle-terminal-043",
    "name": "Palico Tricycle Terminal",
    "city": null,
    "latitude": 14.4246006,
    "longitude": 120.9466268
  },
  {
    "id": "tric-tricycle-terminal-44-044",
    "name": "Tricycle Terminal 44",
    "city": null,
    "latitude": 14.2923143,
    "longitude": 121.0442597
  },
  {
    "id": "tric-malabag-tricycle-terminal-045",
    "name": "Malabag Tricycle Terminal",
    "city": null,
    "latitude": 14.1422339,
    "longitude": 120.9561864
  },
  {
    "id": "tric-tricycle-terminal-046",
    "name": "Tricycle terminal",
    "city": null,
    "latitude": 14.4034069,
    "longitude": 120.9031899
  },
  {
    "id": "tric-tricycle-terminal-47-047",
    "name": "Tricycle Terminal 47",
    "city": null,
    "latitude": 14.2455964,
    "longitude": 120.8783826
  },
  {
    "id": "tric-tricycle-terminal-48-048",
    "name": "Tricycle Terminal 48",
    "city": null,
    "latitude": 14.3961943,
    "longitude": 120.8645037
  },
  {
    "id": "tric-ratoda-tricycle-terminal-049",
    "name": "RATODA Tricycle Terminal",
    "city": "Imus",
    "latitude": 14.4133277,
    "longitude": 120.9406868
  },
  {
    "id": "tric-pedicab-terminal-050",
    "name": "Pedicab Terminal",
    "city": null,
    "latitude": 14.3895127,
    "longitude": 120.9407027
  },
  {
    "id": "tric-tricycle-terminal-051",
    "name": "Tricycle Terminal",
    "city": null,
    "latitude": 14.3944041,
    "longitude": 120.9402655
  },
  {
    "id": "tric-anabu-i-f-pedicab-terminal-052",
    "name": "Anabu I-F Pedicab Terminal",
    "city": null,
    "latitude": 14.389835,
    "longitude": 120.9399129
  },
  {
    "id": "tric-tricycle-terminal-53-053",
    "name": "Tricycle Terminal 53",
    "city": null,
    "latitude": 14.3879125,
    "longitude": 120.9409456
  },
  {
    "id": "tric-regatta-drive-pedicab-terminal-054",
    "name": "Regatta Drive Pedicab Terminal",
    "city": "Imus",
    "latitude": 14.3862416,
    "longitude": 120.9409929
  },
  {
    "id": "tric-anabu-ii-b-pedicab-terminal-055",
    "name": "Anabu II-B Pedicab Terminal",
    "city": null,
    "latitude": 14.3849061,
    "longitude": 120.9413201
  },
  {
    "id": "tric-tricycle-terminal-056",
    "name": "Tricycle Terminal",
    "city": null,
    "latitude": 14.3867745,
    "longitude": 120.9407954
  },
  {
    "id": "tric-tricycle-terminal-station-057",
    "name": "Tricycle Terminal Station",
    "city": null,
    "latitude": 14.1845318,
    "longitude": 120.7961772
  },
  {
    "id": "tric-pasinaya-homes-north-tricycle-terminal-058",
    "name": "Pasinaya Homes North Tricycle Terminal",
    "city": "Naic",
    "latitude": 14.324518,
    "longitude": 120.8011608
  },
  {
    "id": "tric-pasinaya-homes-west-tricycle-terminal-059",
    "name": "Pasinaya Homes West Tricycle Terminal",
    "city": "Naic",
    "latitude": 14.3227821,
    "longitude": 120.8027145
  },
  {
    "id": "tric-tierra-vista-tricycle-station-060",
    "name": "Tierra Vista Tricycle Station",
    "city": null,
    "latitude": 14.2959533,
    "longitude": 120.9449713
  },
  {
    "id": "tric-sakada-tricycle-station-061",
    "name": "Sakada Tricycle Station",
    "city": null,
    "latitude": 14.3449003,
    "longitude": 120.9817052
  },
  {
    "id": "tric-tricycle-terminal-62-062",
    "name": "Tricycle Terminal 62",
    "city": null,
    "latitude": 14.3407978,
    "longitude": 120.9373049
  },
  {
    "id": "tric-mckstl-toda-063",
    "name": "Mckstl Toda",
    "city": null,
    "latitude": 14.4278914,
    "longitude": 120.8940469
  },
  {
    "id": "tric-tricycle-terminal-64-064",
    "name": "Tricycle Terminal 64",
    "city": null,
    "latitude": 14.3463,
    "longitude": 120.9816545
  },
  {
    "id": "tric-tricycle-terminal-65-065",
    "name": "Tricycle Terminal 65",
    "city": null,
    "latitude": 14.4496208,
    "longitude": 120.9231891
  },
  {
    "id": "tric-troddac-tricycle-station-066",
    "name": "TRODDAC Tricycle Station",
    "city": null,
    "latitude": 14.3277343,
    "longitude": 120.9347605
  },
  {
    "id": "tric-tricycle-terminal-67-067",
    "name": "Tricycle Terminal 67",
    "city": null,
    "latitude": 14.3553359,
    "longitude": 120.9117951
  },
  {
    "id": "tric-tricycle-terminal-68-068",
    "name": "Tricycle Terminal 68",
    "city": null,
    "latitude": 14.3546786,
    "longitude": 120.9227625
  },
  {
    "id": "tric-tricycle-terminal-69-069",
    "name": "Tricycle Terminal 69",
    "city": "Dasmarinas",
    "latitude": 14.358567,
    "longitude": 120.9376398
  },
  {
    "id": "tric-fedjstoda-tricycle-station-070",
    "name": "FEDJSTODA Tricycle Station",
    "city": null,
    "latitude": 14.3105477,
    "longitude": 120.9701204
  },
  {
    "id": "tric-san-juan-toda-terminal-071",
    "name": "San Juan TODA Terminal",
    "city": null,
    "latitude": 14.4338178,
    "longitude": 120.8825104
  },
  {
    "id": "tric-lavanya-square-tricycle-station-072",
    "name": "Lavanya Square Tricycle Station",
    "city": null,
    "latitude": 14.4055846,
    "longitude": 120.8776995
  },
  {
    "id": "tric-tricycle-terminal-73-073",
    "name": "Tricycle Terminal 73",
    "city": null,
    "latitude": 14.2877574,
    "longitude": 121.0471614
  },
  {
    "id": "tric-smd-tc-hub-074",
    "name": "SMD TC Hub",
    "city": null,
    "latitude": 14.2999709,
    "longitude": 120.9576635
  },
  {
    "id": "tric-metrogate-dasmarinas-tricycle-station-075",
    "name": "Metrogate Dasmarinas Tricycle Station",
    "city": null,
    "latitude": 14.2988288,
    "longitude": 120.9485928
  },
  {
    "id": "tric-tricycle-terminal-76-076",
    "name": "Tricycle Terminal 76",
    "city": null,
    "latitude": 14.3178173,
    "longitude": 121.0577364
  },
  {
    "id": "tric-tricycle-terminal-77-077",
    "name": "Tricycle Terminal 77",
    "city": null,
    "latitude": 14.4087318,
    "longitude": 120.8586959
  },
  {
    "id": "tric-tricycle-terminal-78-078",
    "name": "Tricycle Terminal 78",
    "city": null,
    "latitude": 14.2833022,
    "longitude": 120.842932
  },
  {
    "id": "tric-bmttoda-tc-station-079",
    "name": "BMTTODA TC Station",
    "city": null,
    "latitude": 14.1361146,
    "longitude": 120.955125
  },
  {
    "id": "tric-indang-tricycle-terminal-080",
    "name": "Indang Tricycle Terminal",
    "city": null,
    "latitude": 14.1968056,
    "longitude": 120.8777931
  },
  {
    "id": "tric-tricycle-terminal-81-081",
    "name": "Tricycle Terminal 81",
    "city": null,
    "latitude": 14.2806111,
    "longitude": 120.8704092
  },
  {
    "id": "tric-hvr-tricycle-terminal-082",
    "name": "HVR Tricycle Terminal",
    "city": null,
    "latitude": 14.3402185,
    "longitude": 120.7915955
  }
];

export default TRICYCLE_TERMINALS_FALLBACK;
