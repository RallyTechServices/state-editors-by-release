Ext.define('Rally.technicalservices.AuditStore',{
    extend: 'Ext.data.Store',

    constructor: function(config) {
        var snaps_by_oid = {};
        if (config.snapshots){
            snaps_by_oid = this.aggregateSnapsByOidForModel(config.snapshots);
        }

        var data = [],
            fields = ['FormattedID','ObjectID',"Name","ChangedBy","DateChanged"],
            prevStateField = "_PreviousValues.ScheduleState",
            stateField = "ScheduleState",
            auditStateValue = "Accepted";


        _.each(snaps_by_oid, function(snaps, oid){
            var rec = {FormattedID: null, ObjectID: null, Name: null, ChangedBy: null, DateChanged: null, snap: null};
            _.each(snaps, function(snap){
                rec.FormattedID = snap.FormattedID;
                rec.ObjectID = snap.ObjectID;
                rec.Name = snap.Name;
                if (snap[prevStateField] != snap[stateField] && snap[stateField] == auditStateValue){
                    rec.ChangedBy = snap._User;
                    rec.DateChanged = snap._ValidFrom
                }
                //rec.snap = snap;
            });
            data.push(rec);
        });

        config.data = data;
        config.fields = [];
        config.pageSize = data.length;
        console.log('config',config);
        _.each(fields, function(field){
            config.fields.push({name: field});
        });

        this.callParent(arguments);

    },
    aggregateSnapsByOidForModel: function(snaps){
        //Return a hash of objects (key=ObjectID) with all snapshots for the object
        var snaps_by_oid = {};
        Ext.each(snaps, function(snap){
            var oid = snap.ObjectID || snap.get('ObjectID');
            if (snaps_by_oid[oid] == undefined){
                snaps_by_oid[oid] = [];
            }
            snaps_by_oid[oid].push(snap.getData());

        });
        return snaps_by_oid;
    }
});