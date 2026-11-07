-- Appen är för en familj: databasen tillåter högst ett konto (unikt index på ett konstant uttryck).
-- Detta stoppar samtidiga registreringar som annars kan ta sig förbi en räknekontroll i koden.
CREATE UNIQUE INDEX "user_single_account" ON "user" ((true));
