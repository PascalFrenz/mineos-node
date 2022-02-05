import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FontAwesomeModule } from "@fortawesome/angular-fontawesome";
import { ChartsModule } from 'ng2-charts';
import { MomentModule } from 'ngx-moment';
import { SocketIoModule } from "ngx-socket-io";
import { AppRoutingModule } from './app-routing.module';

// App Components
import { AppComponent } from './app.component';
import { ActiveServerListComponent } from './components/active-server-list/active-server-list.component';
import { ArchiveComponent } from './components/archive/archive.component';
import { AuthenticatedPageComponent } from './components/authenticated-page/authenticated-page.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { CardComponent } from './components/card/card.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EnvironmentComponent } from './components/environment/environment.component';
import { HeaderComponent } from './components/header/header.component';
import { LoadAveragesComponent } from './components/load-averages/load-averages.component';
import { LoggingComponent } from './components/logging/logging.component';
import { LoginComponent } from './components/login/login.component';
import { MiniCardComponent } from './components/mini-card/mini-card.component';
import { MemoryCardComponent } from './components/mini-cards/memory-card.component';
import { PlayerCardComponent } from './components/mini-cards/player-card.component';
import { ServerCardComponent } from './components/mini-cards/server-card.component';
import { UptimeCardComponent } from './components/mini-cards/uptime-card.component';
import { ProfilesComponent } from './components/profiles/profiles.component';
import { RestorePointComponent } from './components/restore-point/restore-point.component';
import { SchedulingComponent } from './components/scheduling/scheduling.component';
import { ServerDetailsComponent } from './components/server-details/server-details.component';
import { StatusComponent } from './components/status/status.component';
import { BytesToMegabytesPipe } from './pipes/bytes-to-megabytes.pipe';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    DashboardComponent,
    HeaderComponent,
    ServerDetailsComponent,
    StatusComponent,
    EnvironmentComponent,
    RestorePointComponent,
    ArchiveComponent,
    SchedulingComponent,
    LoggingComponent,
    ProfilesComponent,
    CalendarComponent,
    ActiveServerListComponent,
    ServerCardComponent,
    PlayerCardComponent,
    UptimeCardComponent,
    MemoryCardComponent,
    BytesToMegabytesPipe,
    LoadAveragesComponent,
    MiniCardComponent,
    CardComponent,
    AuthenticatedPageComponent
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    FontAwesomeModule,
    BrowserAnimationsModule,
    HttpClientModule,
    MomentModule,
    ChartsModule,
    ReactiveFormsModule,
    SocketIoModule.forRoot({url: "", options: {transports: ["websocket"]}})
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
