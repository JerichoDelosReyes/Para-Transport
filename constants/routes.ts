export const ROUTES = [
  {
    id: 1,
    name: "Imus Centrum to Bacoor Boulevard",
    legs: [
      { mode: "Tricycle", from: "Imus Centrum", to: "Tanzang Luma", fare: 15, km: 2, minutes: 10, instructions: "Sumakay ng tricycle sa Imus Centrum" },
      { mode: "Jeepney", from: "Tanzang Luma", to: "Bacoor Boulevard", fare: 14, km: 4, minutes: 25, instructions: "Mag-jeep papunta Bacoor Boulevard" }
    ],
    total_fare: 29, total_km: 6, estimated_minutes: 35
  },
  {
    id: 2,
    name: "Dasmariñas Burol to Imus Crossing",
    legs: [
      { mode: "Tricycle", from: "Burol Main", to: "Dasmariñas Crossing", fare: 15, km: 1.5, minutes: 8, instructions: "Tricycle pa-crossing" },
      { mode: "UV Express", from: "Dasmariñas Crossing", to: "Imus Crossing", fare: 35, km: 6, minutes: 30, instructions: "UV Express to Imus" }
    ],
    total_fare: 50, total_km: 7.5, estimated_minutes: 38
  },
  {
    id: 3,
    name: "Imus to Mall of Asia",
    legs: [
      { mode: "Jeepney", from: "Imus Crossing", to: "Bacoor", fare: 14, km: 5, minutes: 25, instructions: "Jeep pa-Bacoor" },
      { mode: "Bus", from: "Bacoor", to: "Mall of Asia", fare: 50, km: 12, minutes: 50, instructions: "Bus papunta MOA" }
    ],
    total_fare: 64, total_km: 17, estimated_minutes: 75
  },
  {
    id: 4,
    name: "Dasmariñas to Pasay via Coastal",
    legs: [
      { mode: "UV Express", from: "Dasmariñas", to: "Zapote", fare: 60, km: 10, minutes: 45, instructions: "UV pa-Zapote" },
      { mode: "Bus", from: "Zapote", to: "Pasay Rotonda", fare: 35, km: 8, minutes: 35, instructions: "Bus pa-Pasay" }
    ],
    total_fare: 95, total_km: 18, estimated_minutes: 80
  },
  {
    id: 5,
    name: "Imus to Taft via LRT1",
    legs: [
      { mode: "Jeepney", from: "Imus", to: "Bacoor Habay", fare: 14, km: 6, minutes: 30, instructions: "Jeep pa-Habay" },
      { mode: "UV Express", from: "Habay", to: "Baclaran", fare: 45, km: 7, minutes: 35, instructions: "UV pa-Baclaran" },
      { mode: "LRT1", from: "Baclaran", to: "Taft", fare: 12, km: 1, minutes: 5, instructions: "LRT to Taft" }
    ],
    total_fare: 71, total_km: 14, estimated_minutes: 70
  }
];
